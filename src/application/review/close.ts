/** Fin du rituel : clôture (contrats de l'année suivante créés), réouverture, suppression. */
import { and, eq, inArray } from "drizzle-orm";
import { type ModelType } from "@/domain/lamal";
import type { Db } from "@/infrastructure/db/client";
import { lamalPolicy, person, review, reviewLine } from "@/infrastructure/db/schema";
import { UserError } from "../errors";
import { findReview, ownedReview, type Scope } from "../scope";

/** Crée les contrats de l'année cible à partir des décisions, puis clôt la revue. */
export function closeReview(db: Db, scope: Scope, reviewId: number, nowIso: string) {
  const r = ownedReview(db, scope, reviewId);
  if (r.status === "CLOSED") return;
  const lines = db.select().from(reviewLine).where(eq(reviewLine.reviewId, reviewId)).all();
  const undecided = lines.filter((l) => l.decision === "UNDECIDED" || l.chosenMonthlyRp === null);
  if (undecided.length) throw new UserError("Toutes les personnes doivent avoir une décision avant la clôture.");
  db.transaction((tx) => {
    for (const l of lines) {
      const prev = tx.select().from(lamalPolicy).where(eq(lamalPolicy.id, l.currentPolicyId)).get()!;
      const existing = tx
        .select()
        .from(lamalPolicy)
        .where(and(eq(lamalPolicy.personId, l.personId), eq(lamalPolicy.coverageYear, r.targetYear)))
        .get();
      if (existing?.source === "MANUAL") {
        const p = tx.select({ firstName: person.firstName }).from(person).where(eq(person.id, l.personId)).get();
        throw new UserError(
          `Un contrat ${r.targetYear} saisi à la main existe déjà pour ${p?.firstName ?? "cette personne"} : supprimez-le ou gardez-le.`,
        );
      }
      const values = {
        personId: l.personId,
        coverageYear: r.targetYear,
        insurerId: l.chosenInsurerId!,
        policyNumber: l.decision === "SWITCH" ? null : prev.policyNumber,
        tariffCode: l.chosenTariffCode,
        tariffLabel: l.chosenLabel,
        modelType: (l.chosenModelType ?? prev.modelType) as ModelType,
        franchiseChf: l.chosenFranchiseChf!,
        accident: l.accident,
        billedMonthlyRp: l.chosenMonthlyRp!,
        source: "REVIEW" as const,
      };
      // Un contrat importé (OFSP) ou issu d'une clôture précédente est remplacé par la décision.
      if (existing) tx.update(lamalPolicy).set(values).where(eq(lamalPolicy.id, existing.id)).run();
      else tx.insert(lamalPolicy).values(values).run();
    }
    tx.update(review).set({ status: "CLOSED", closedAt: nowIso }).where(eq(review.id, reviewId)).run();
  });
}

/**
 * Annule la clôture : retire les contrats de l'année cible créés par la clôture et rouvre la revue.
 * Les décisions restent, on peut les modifier puis clôturer à nouveau.
 */
export function reopenReview(db: Db, scope: Scope, reviewId: number) {
  const r = ownedReview(db, scope, reviewId);
  if (r.status !== "CLOSED") return;
  const created = createdPolicies(db, r.id, r.targetYear);
  const ids = created.map((p) => p.id);
  if (ids.length) {
    const usedBy = db.select().from(reviewLine).where(inArray(reviewLine.currentPolicyId, ids)).get();
    if (usedBy) {
      const later = db.select().from(review).where(eq(review.id, usedBy.reviewId)).get()!;
      throw new UserError(`Le rituel ${later.targetYear} s'appuie sur ces contrats : supprimez-le d'abord.`);
    }
  }
  db.transaction((tx) => {
    if (ids.length) tx.delete(lamalPolicy).where(inArray(lamalPolicy.id, ids)).run();
    tx.update(review).set({ status: "OPEN", closedAt: null }).where(eq(review.id, r.id)).run();
  });
}

/** Supprime le rituel (décisions et lettres comprises), même clôturé : on revient à l'état d'avant. */
export function deleteReview(db: Db, scope: Scope, reviewId: number) {
  const r = findReview(db, scope, reviewId);
  if (!r) return;
  reopenReview(db, scope, reviewId);
  db.delete(review).where(eq(review.id, reviewId)).run();
}

function createdPolicies(db: Db, reviewId: number, targetYear: number) {
  const personIds = db
    .select({ personId: reviewLine.personId })
    .from(reviewLine)
    .where(eq(reviewLine.reviewId, reviewId))
    .all()
    .map((l) => l.personId);
  if (!personIds.length) return [];
  return db
    .select()
    .from(lamalPolicy)
    .where(
      and(
        inArray(lamalPolicy.personId, personIds),
        eq(lamalPolicy.coverageYear, targetYear),
        eq(lamalPolicy.source, "REVIEW"),
      ),
    )
    .all();
}
