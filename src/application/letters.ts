import { and, eq, isNull } from "drizzle-orm";
import { isMinorOn } from "@/domain/age";
import type { IsoDate } from "@/domain/dates";
import { reviewDeadlines } from "@/domain/deadlines";
import { buildLetter, type LetterContent } from "@/domain/letter";
import { MODEL_LABEL, type ModelType } from "@/domain/lamal";
import type { Db } from "@/infrastructure/db/client";
import { insurerLabel, insurerRecipient } from "@/domain/insurer";
import { household, insurer, letter, review } from "@/infrastructure/db/schema";
import { UserError } from "./errors";
import { getReviewView } from "./review";
import { findLetter, ownedLetter, type Scope } from "./scope";
import { bumpUsage } from "./usage";

/*
 * Lettres (courriers postaux) du rituel adressées à la caisse actuelle : résiliation ou
 * changement de franchise/modèle. Génération, rendu, puis suivi (envoi, n° de suivi, confirmation
 * de la caisse). Une lettre envoyée est figée.
 */

export interface GenerateLettersResult {
  created: number[];
  blocked: { person: string; reasons: string[] }[];
}

/**
 * Génère une lettre par caisse actuelle et par type (résiliation / changement), pour toutes
 * les personnes concernées. Les lettres non envoyées sont régénérées ; les envoyées sont figées.
 */
export function generateLetters(db: Db, scope: Scope, reviewId: number, today: IsoDate): GenerateLettersResult {
  const view = getReviewView(db, scope, reviewId, today);
  const householdRow = db.select().from(household).where(eq(household.id, view.review.householdId)).get();
  if (!householdRow) throw new UserError("Foyer non configuré.");
  const deadlines = reviewDeadlines(view.review.targetYear);

  const blocked: GenerateLettersResult["blocked"] = [];
  const groups = new Map<string, typeof view.lines>();
  const sentLineIds = new Set(view.letters.filter((l) => l.sentAt).flatMap((l) => l.lineIds));

  for (const lineView of view.lines) {
    if (lineView.line.decision !== "SWITCH" && lineView.line.decision !== "ADJUST") continue;
    if (sentLineIds.has(lineView.line.id)) continue;
    if (!lineView.letterCheck.allowed) {
      blocked.push({ person: `${lineView.person.firstName} ${lineView.person.lastName}`, reasons: lineView.letterCheck.blockers });
      continue;
    }
    const kind = lineView.line.decision === "SWITCH" ? "TERMINATION" : "CHANGE";
    const key = `${lineView.policy.insurerId}|${kind}`;
    groups.set(key, [...(groups.get(key) ?? []), lineView]);
  }

  const created: number[] = [];
  db.transaction((tx) => {
    // Toute lettre non envoyée est obsolète (une décision a pu être annulée) : on repart de zéro.
    tx.delete(letter).where(and(eq(letter.reviewId, reviewId), isNull(letter.sentAt))).run();
    for (const [key, members] of groups) {
      const [insurerIdStr, kind] = key.split("|") as [string, "TERMINATION" | "CHANGE"];
      const insurerId = Number(insurerIdStr);
      const insurerRow = tx.select().from(insurer).where(eq(insurer.id, insurerId)).get()!;
      const adults = members.filter((m) => m.line.targetAgeClass !== "KID");
      const sender = adults[0]?.person ?? members[0]!.person;
      const newInsurers = [...new Set(members.map((m) => m.chosenInsurerName).filter(Boolean))];
      const content: LetterContent = buildLetter({
        kind,
        senderLines: [`${sender.firstName} ${sender.lastName}`, householdRow.street, `${householdRow.postalCode} ${householdRow.city}`].filter((l) => l.trim()),
        insurerLines: insurerRecipient(insurerRow),
        place: householdRow.city || "",
        date: today,
        effectiveEnd: deadlines.effectiveEnd,
        targetYear: view.review.targetYear,
        persons: members.map((m) => ({
          fullName: `${m.person.firstName} ${m.person.lastName}`,
          birthDate: m.person.birthDate,
          policyNumber: m.policy.policyNumber,
          isMinor: isMinorOn(m.person.birthDate, today),
        })),
        changes: members.map(
          (m) =>
            `nouvelle franchise CHF ${m.line.chosenFranchiseChf}, modèle « ${m.line.chosenLabel ?? MODEL_LABEL[(m.line.chosenModelType ?? "OTHER") as ModelType]} »`,
        ),
        newInsurerName: newInsurers.length === 1 ? newInsurers[0] : null,
      });
      const row = tx
        .insert(letter)
        .values({ reviewId, insurerId, kind, lineIds: members.map((m) => m.line.id), content })
        .returning()
        .get();
      created.push(row.id);
    }
  });
  return { created, blocked };
}

/** Lettre du foyer ; null si elle n'existe pas ou appartient à un autre foyer. */
export function getLetter(db: Db, scope: Scope, id: number) {
  const row = findLetter(db, scope, id);
  if (!row) return null;
  return { ...row, content: row.content as LetterContent };
}

/** Lettre du foyer prête à rendre en PDF : contenu, caisse destinataire et année visée. */
export function letterDocument(db: Db, scope: Scope, id: number) {
  const row = getLetter(db, scope, id);
  if (!row) return null;
  const insurerRow = db.select().from(insurer).where(eq(insurer.id, row.insurerId)).get()!;
  const r = db.select({ targetYear: review.targetYear }).from(review).where(eq(review.id, row.reviewId)).get()!;
  return { ...row, insurerName: insurerLabel(insurerRow), targetYear: r.targetYear };
}

// ───────────────────────── Suivi des courriers ─────────────────────────

/** Supprime une lettre pas encore envoyée ; sans effet si elle est introuvable. */
export function deleteLetter(db: Db, scope: Scope, letterId: number) {
  const l = findLetter(db, scope, letterId);
  if (!l) return;
  if (l.sentAt) throw new UserError("Une lettre envoyée ne peut pas être supprimée.");
  db.delete(letter).where(eq(letter.id, letterId)).run();
}

/** Lettre postée (date AAAA-MM-JJ, n° de suivi du recommandé facultatif) ; le compteur d'usage n'avance qu'une fois. */
export function markLetterSent(db: Db, scope: Scope, letterId: number, sentAt: string, trackingNumber: string | null) {
  const row = ownedLetter(db, scope, letterId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sentAt)) throw new UserError("Date d'envoi au format AAAA-MM-JJ.");
  if (trackingNumber && trackingNumber.length > 60) throw new UserError("Numéro de suivi trop long.");
  db.transaction((tx) => {
    tx.update(letter).set({ sentAt, trackingNumber }).where(eq(letter.id, letterId)).run();
    if (!row.sentAt) bumpUsage(tx, "letters.sent");
  });
}

/** Réception confirmée par la caisse à la date `at` ; null annule la confirmation. */
export function markLetterAcknowledged(db: Db, scope: Scope, letterId: number, at: string | null) {
  ownedLetter(db, scope, letterId);
  db.update(letter).set({ acknowledgedAt: at }).where(eq(letter.id, letterId)).run();
}
