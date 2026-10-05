/** Décision pour une personne : garder, changer de caisse, changer de franchise ou de modèle. */
import { eq } from "drizzle-orm";
import { costOf } from "@/domain/comparison";
import type { Db } from "@/infrastructure/db/client";
import { offersFor, parametersFor } from "@/infrastructure/db/queries";
import { person, reviewLine, tariffLineage } from "@/infrastructure/db/schema";
import { UserError } from "../errors";
import { ownedLine, type Scope } from "../scope";
import { premiumProfileFor, renewalFor, loadLine, linesWithSentLetter } from "./lines";

/** Confirme à quel tarif de l'année cible correspond le tarif actuel, puis recalcule la ligne. */
export function confirmLineage(db: Db, scope: Scope, lineId: number, toCode: string) {
  const { line, review: r, policy, person: p } = loadLine(db, scope, lineId);
  if (!policy.tariffCode) throw new UserError("Le contrat actuel n'a pas de code tarif : choisissez le tarif de renouvellement dans le contrat.");
  db.insert(tariffLineage)
    .values({ householdId: r.householdId, insurerId: policy.insurerId, fromYear: r.targetYear - 1, fromCode: policy.tariffCode, toYear: r.targetYear, toCode })
    .onConflictDoUpdate({
      target: [tariffLineage.householdId, tariffLineage.insurerId, tariffLineage.fromYear, tariffLineage.fromCode, tariffLineage.toYear],
      set: { toCode },
    })
    .run();
  db.update(reviewLine).set(renewalFor(db, r, p, policy)).where(eq(reviewLine.id, line.id)).run();
}

export interface Choice {
  tariffId: number;
  franchiseChf: number;
}

/** Enregistre un choix : la décision (garder, changer de caisse, ajuster) en découle. Valeurs figées. */
export function decide(db: Db, scope: Scope, lineId: number, choice: Choice, nowIso: string) {
  const { line, review: r, policy, person: p } = loadLine(db, scope, lineId);
  const offers = offersFor(db, premiumProfileFor(db, r, line));
  const offer = offers.find((o) => o.tariffId === choice.tariffId && o.franchiseChf === choice.franchiseChf);
  if (!offer) throw new UserError("Offre introuvable pour ce profil.");
  const params = parametersFor(db, r.targetYear);
  const cost = costOf(offer, { ageClass: line.targetAgeClass, params, healthCostsRp: p.healthCostsRp });
  const sameInsurer = offer.insurerId === policy.insurerId;
  const isRenewal =
    sameInsurer && offer.tariffCode === line.renewalTariffCode && offer.franchiseChf === line.renewalFranchiseChf;
  const decision = isRenewal ? "KEEP" : sameInsurer ? "ADJUST" : "SWITCH";
  db.update(reviewLine)
    .set({
      decision,
      chosenInsurerId: offer.insurerId,
      chosenTariffCode: offer.tariffCode,
      chosenLabel: offer.tariffLabel,
      chosenModelType: offer.modelType,
      chosenFranchiseChf: offer.franchiseChf,
      chosenMonthlyRp: offer.monthlyPremiumRp,
      chosenTotalRp: cost.totalRp,
      decidedAt: nowIso,
    })
    .where(eq(reviewLine.id, line.id))
    .run();
  return decision;
}

/** Garder le contrat tel quel, même si le renouvellement n'a pas été retrouvé automatiquement. */
export function keepAsIs(db: Db, scope: Scope, lineId: number, nowIso: string) {
  const { line, policy } = loadLine(db, scope, lineId);
  if (line.renewalMonthlyRp === null) {
    throw new UserError("Renouvellement inconnu : confirmez d'abord le tarif correspondant de l'année prochaine.");
  }
  db.update(reviewLine)
    .set({
      decision: "KEEP",
      chosenInsurerId: policy.insurerId,
      chosenTariffCode: line.renewalTariffCode,
      chosenLabel: line.renewalLabel,
      chosenModelType: policy.modelType,
      chosenFranchiseChf: line.renewalFranchiseChf,
      chosenMonthlyRp: line.renewalMonthlyRp,
      chosenTotalRp: null,
      decidedAt: nowIso,
    })
    .where(eq(reviewLine.id, line.id))
    .run();
}

/** Remet la personne « à décider » ; impossible une fois sa lettre envoyée. */
export function undoDecision(db: Db, scope: Scope, lineId: number) {
  const { line } = loadLine(db, scope, lineId);
  const sent = linesWithSentLetter(db, line.reviewId);
  if (sent.has(line.id)) throw new UserError("La lettre est déjà envoyée : la décision ne peut plus être annulée.");
  db.update(reviewLine)
    .set({
      decision: "UNDECIDED",
      chosenInsurerId: null,
      chosenTariffCode: null,
      chosenLabel: null,
      chosenModelType: null,
      chosenFranchiseChf: null,
      chosenMonthlyRp: null,
      chosenTotalRp: null,
      decidedAt: null,
    })
    .where(eq(reviewLine.id, line.id))
    .run();
}

/** Contrôle des complémentaires LCA confirmé : condition pour préparer une résiliation (domain/review.ts). */
export function acknowledgeLca(db: Db, scope: Scope, lineId: number, nowIso: string) {
  loadLine(db, scope, lineId);
  db.update(reviewLine).set({ lcaAckAt: nowIso }).where(eq(reviewLine.id, lineId)).run();
}

/**
 * Cases à cocher d'une ligne : médecin vérifié dans la liste du modèle (`doctorCheck`), affiliation
 * demandée ou confirmée par la nouvelle caisse (dates ; null annule).
 */
export function setLineFlags(
  db: Db,
  scope: Scope,
  lineId: number,
  flags: { doctorCheck?: "YES" | "NO" | "UNKNOWN"; affiliationRequestedAt?: string | null; affiliationConfirmedAt?: string | null },
) {
  loadLine(db, scope, lineId);
  if (flags.doctorCheck !== undefined && !["YES", "NO", "UNKNOWN"].includes(flags.doctorCheck)) throw new UserError("Réponse inconnue.");
  db.update(reviewLine).set(flags).where(eq(reviewLine.id, lineId)).run();
}

/** Frais de santé attendus de la personne d'une ligne (comparateur). */
export function setHealthCosts(db: Db, scope: Scope, lineId: number, amountRp: number) {
  if (!Number.isInteger(amountRp) || amountRp < 0) throw new UserError("Montant invalide.");
  const line = ownedLine(db, scope, lineId);
  db.update(person).set({ healthCostsRp: amountRp }).where(eq(person.id, line.personId)).run();
}
