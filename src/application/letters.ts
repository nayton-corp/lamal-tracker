import { and, eq, isNull } from "drizzle-orm";
import type { IsoDate } from "@/domain/dates";
import { reviewDeadlines } from "@/domain/deadlines";
import { buildLetter, type LetterContent } from "@/domain/letter";
import { MODEL_LABEL, type ModelType } from "@/domain/lamal";
import type { Db } from "@/infrastructure/db/client";
import { insurerRecipient } from "@/infrastructure/db/queries";
import { insurer, letter } from "@/infrastructure/db/schema";
import { getHousehold } from "./household";
import { getReviewView, UserError } from "./review";

export interface GenerateResult {
  created: number[];
  blocked: { person: string; reasons: string[] }[];
}

/**
 * Génère une lettre par caisse actuelle et par type (résiliation / changement), pour toutes
 * les personnes concernées. Les lettres non envoyées sont régénérées ; les envoyées sont figées.
 */
export function generateLetters(db: Db, reviewId: number, today: IsoDate): GenerateResult {
  const view = getReviewView(db, reviewId, today);
  const h = getHousehold(db);
  if (!h) throw new UserError("Foyer non configuré.");
  const deadlines = reviewDeadlines(view.review.targetYear);

  const blocked: GenerateResult["blocked"] = [];
  const groups = new Map<string, typeof view.persons>();
  const sentLineIds = new Set(view.letters.filter((l) => l.sentAt).flatMap((l) => l.lineIds));

  for (const pr of view.persons) {
    if (pr.line.decision !== "SWITCH" && pr.line.decision !== "ADJUST") continue;
    if (sentLineIds.has(pr.line.id)) continue;
    if (!pr.letterCheck.allowed) {
      blocked.push({ person: `${pr.person.firstName} ${pr.person.lastName}`, reasons: pr.letterCheck.blockers });
      continue;
    }
    const kind = pr.line.decision === "SWITCH" ? "TERMINATION" : "CHANGE";
    const key = `${pr.policy.insurerId}|${kind}`;
    groups.set(key, [...(groups.get(key) ?? []), pr]);
  }

  const created: number[] = [];
  db.transaction((tx) => {
    for (const [key, members] of groups) {
      const [insurerIdStr, kind] = key.split("|") as [string, "TERMINATION" | "CHANGE"];
      const insurerId = Number(insurerIdStr);
      const ins = tx.select().from(insurer).where(eq(insurer.id, insurerId)).get()!;
      const adults = members.filter((m) => m.line.targetAgeClass !== "KID");
      const sender = adults[0]?.person ?? members[0]!.person;
      const newInsurers = [...new Set(members.map((m) => m.chosenInsurer).filter(Boolean))];
      const content: LetterContent = buildLetter({
        kind,
        senderLines: [`${sender.firstName} ${sender.lastName}`, h.street, `${h.postalCode} ${h.city}`].filter((l) => l.trim()),
        insurerLines: insurerRecipient(ins),
        place: h.city || "",
        date: today,
        effectiveEnd: deadlines.effectiveEnd,
        targetYear: view.review.targetYear,
        persons: members.map((m) => ({
          fullName: `${m.person.firstName} ${m.person.lastName}`,
          birthDate: m.person.birthDate,
          policyNumber: m.policy.policyNumber,
          isMinor: view.review.targetYear - 1 - Number(m.person.birthDate.slice(0, 4)) < 18,
        })),
        changes: members.map(
          (m) =>
            `nouvelle franchise CHF ${m.line.chosenFranchiseChf}, modèle « ${m.line.chosenLabel ?? MODEL_LABEL[(m.line.chosenModelType ?? "OTHER") as ModelType]} »`,
        ),
        newInsurerName: newInsurers.length === 1 ? newInsurers[0] : null,
      });
      tx.delete(letter)
        .where(and(eq(letter.reviewId, reviewId), eq(letter.insurerId, insurerId), eq(letter.kind, kind), isNull(letter.sentAt)))
        .run();
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

export function getLetter(db: Db, id: number) {
  const row = db.select().from(letter).where(eq(letter.id, id)).get();
  if (!row) return null;
  return { ...row, content: row.content as LetterContent };
}
