import { and, asc, eq, isNull } from "drizzle-orm";
import { isMinorOn } from "@/domain/age";
import type { IsoDate } from "@/domain/dates";
import { LCA_GUARANTEE_KEYS, guaranteeInfo, type LcaGuarantee } from "@/domain/lca";
import { MODEL_LABEL, displayTariffLabel, type ModelType } from "@/domain/lamal";
import { buildOfferRequest, letterPlainText, type LetterContent } from "@/domain/letter";
import { formatChf } from "@/domain/money";
import type { Db } from "@/infrastructure/db/client";
import { insurerLabel, insurerRecipient } from "@/domain/insurer";
import { household, insurer, lcaPolicy, offerRequest, review, reviewLine } from "@/infrastructure/db/schema";
import { UserError } from "./errors";
import { getReviewView } from "./review";
import { bumpUsage } from "./usage";
import { findOfferRequest, ownedLine, ownedOfferRequest, ownedReview, type Scope } from "./scope";

/*
 * Demandes d'offre : un courrier par nouvelle caisse choisie, qui vaut demande d'affiliation, avec
 * les complémentaires LCA à y demander. Contenu figé à la génération, comme une lettre.
 */

/** Complémentaires à demander pour une ligne : celles choisies, sinon celles en cours. */
export function lcaWishesFor(db: Db, line: { personId: number; lcaWishes: string[] | null }): LcaGuarantee[] {
  if (line.lcaWishes) return line.lcaWishes.filter((k): k is LcaGuarantee => (LCA_GUARANTEE_KEYS as string[]).includes(k));
  const active = db
    .select({ guarantee: lcaPolicy.guarantee })
    .from(lcaPolicy)
    .where(and(eq(lcaPolicy.personId, line.personId), eq(lcaPolicy.active, true)))
    .all();
  return [...new Set(active.map((a) => a.guarantee).filter((g): g is LcaGuarantee => (LCA_GUARANTEE_KEYS as string[]).includes(g ?? "")))];
}

/** Complémentaires à demander (clés inconnues ignorées). Une liste vide = n'en demander aucune. */
export function setLcaWishes(db: Db, scope: Scope, lineId: number, keys: string[]) {
  ownedLine(db, scope, lineId);
  const valid = keys.filter((k) => (LCA_GUARANTEE_KEYS as string[]).includes(k));
  db.update(reviewLine).set({ lcaWishes: valid }).where(eq(reviewLine.id, lineId)).run();
}

/**
 * Prépare une demande d'offre par nouvelle caisse choisie (décision « changer de caisse »),
 * pour toutes les personnes qui la rejoignent. Les demandes non envoyées sont refaites.
 */
export function generateOfferRequests(db: Db, scope: Scope, reviewId: number, today: IsoDate): number[] {
  const view = getReviewView(db, scope, reviewId, today);
  const householdRow = db.select().from(household).where(eq(household.id, view.review.householdId)).get();
  if (!householdRow) throw new UserError("Foyer non configuré.");
  const sent = new Set(listOfferRequests(db, scope, reviewId).filter((o) => o.sentAt).flatMap((o) => o.lineIds));
  const groups = new Map<number, typeof view.lines>();
  for (const lineView of view.lines) {
    if (lineView.line.decision !== "SWITCH" || !lineView.line.chosenInsurerId || sent.has(lineView.line.id)) continue;
    groups.set(lineView.line.chosenInsurerId, [...(groups.get(lineView.line.chosenInsurerId) ?? []), lineView]);
  }

  const wishes = new Map(view.lines.map((pr) => [pr.line.id, lcaWishesFor(db, pr.line)]));
  const created: number[] = [];
  db.transaction((tx) => {
    // Toute demande non envoyée est obsolète (une décision a pu être annulée) : on repart de zéro.
    tx.delete(offerRequest).where(and(eq(offerRequest.reviewId, reviewId), isNull(offerRequest.sentAt))).run();
    for (const [insurerId, members] of groups) {
      const insurerRow = tx.select().from(insurer).where(eq(insurer.id, insurerId)).get()!;
      const adults = members.filter((m) => m.line.targetAgeClass !== "KID");
      const sender = adults[0]?.person ?? members[0]!.person;
      const content = buildOfferRequest({
        senderLines: [`${sender.firstName} ${sender.lastName}`, householdRow.street, `${householdRow.postalCode} ${householdRow.city}`].filter((l) => l.trim()),
        insurerLines: insurerRecipient(insurerRow),
        place: householdRow.city || "",
        date: today,
        targetYear: view.review.targetYear,
        domicile: `à ${[householdRow.street, `${householdRow.postalCode} ${householdRow.city}`].filter((l) => l.trim()).join(", ")}`,
        persons: members.map((m) => {
          const model = (m.line.chosenModelType ?? "OTHER") as ModelType;
          const wish = [
            `modèle « ${m.line.chosenLabel ? displayTariffLabel(m.line.chosenLabel, model) : MODEL_LABEL[model]} »`,
            `franchise CHF ${m.line.chosenFranchiseChf}`,
            m.line.accident ? "avec couverture accident" : "sans couverture accident",
            ...(m.line.chosenMonthlyRp ? [`prime publiée par l'OFSP ${formatChf(m.line.chosenMonthlyRp)} par mois`] : []),
          ].join(", ");
          return {
            fullName: `${m.person.firstName} ${m.person.lastName}`,
            birthDate: m.person.birthDate,
            policyNumber: null,
            isMinor: isMinorOn(m.person.birthDate, today),
            wish,
            lca: (wishes.get(m.line.id) ?? []).map((k) => guaranteeInfo(k)!.label.toLowerCase()),
          };
        }),
      });
      created.push(tx.insert(offerRequest).values({ reviewId, insurerId, lineIds: members.map((m) => m.line.id), content }).returning().get().id);
    }
  });
  return created;
}

/** Demandes d'offre d'un bilan, avec un lien `mailto:` prérempli quand la caisse publie une adresse. */
export function listOfferRequests(db: Db, scope: Scope, reviewId: number) {
  ownedReview(db, scope, reviewId);
  return db
    .select({ request: offerRequest, insurer })
    .from(offerRequest)
    .innerJoin(insurer, eq(insurer.id, offerRequest.insurerId))
    .where(eq(offerRequest.reviewId, reviewId))
    .orderBy(asc(offerRequest.id))
    .all()
    .map(({ request, insurer: ins }) => {
      const content = request.content as LetterContent;
      return {
        ...request,
        content,
        insurerName: insurerLabel(ins),
        email: ins.email,
        website: ins.website,
        mailto: ins.email ? `mailto:${ins.email}?subject=${encodeURIComponent(content.subject)}&body=${encodeURIComponent(letterPlainText(content))}` : null,
      };
    });
}

/** Demande du foyer ; null si elle n'existe pas ou appartient à un autre foyer. */
export function getOfferRequest(db: Db, scope: Scope, id: number) {
  const row = findOfferRequest(db, scope, id);
  return row ? { ...row, content: row.content as LetterContent } : null;
}

/** Envoi de la demande (null : envoi annulé) : vaut demande d'affiliation pour les personnes concernées. */
export function markOfferRequestSent(db: Db, scope: Scope, id: number, at: IsoDate | null) {
  const row = ownedOfferRequest(db, scope, id);
  db.transaction((tx) => {
    tx.update(offerRequest).set({ sentAt: at, answeredAt: at ? row.answeredAt : null }).where(eq(offerRequest.id, id)).run();
    if (at && !row.sentAt) bumpUsage(tx, "letters.sent");
    for (const lineId of row.lineIds) {
      const line = tx.select().from(reviewLine).where(eq(reviewLine.id, lineId)).get();
      if (!line) continue;
      if (at && !line.affiliationRequestedAt) tx.update(reviewLine).set({ affiliationRequestedAt: at }).where(eq(reviewLine.id, lineId)).run();
      // Envoi annulé : la demande n'est plus faite (le bilan, s'il était clôturé, se rouvre).
      if (!at && line.affiliationRequestedAt) tx.update(reviewLine).set({ affiliationRequestedAt: null }).where(eq(reviewLine.id, lineId)).run();
    }
  });
}

/** Supprime une demande pas encore envoyée ; une demande envoyée reste, sans erreur. */
export function deleteOfferRequest(db: Db, scope: Scope, id: number) {
  if (!findOfferRequest(db, scope, id)) return;
  db.delete(offerRequest).where(and(eq(offerRequest.id, id), isNull(offerRequest.sentAt))).run();
}

/** Demande d'offre du foyer prête à rendre en PDF : contenu, caisse destinataire et année visée. */
export function offerDocument(db: Db, scope: Scope, id: number) {
  const row = getOfferRequest(db, scope, id);
  if (!row) return null;
  const insurerRow = db.select().from(insurer).where(eq(insurer.id, row.insurerId)).get()!;
  const r = db.select({ targetYear: review.targetYear }).from(review).where(eq(review.id, row.reviewId)).get()!;
  return { ...row, insurerName: insurerLabel(insurerRow), targetYear: r.targetYear };
}
