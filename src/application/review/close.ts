/**
 * Fin du bilan : clôture (contrats de l'année suivante créés), réouverture, suppression. La
 * clôture est automatique : `syncReviewClosure` la fait dès que le dernier courrier est envoyé.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { IsoDate } from "@/domain/dates";
import { type ModelType } from "@/domain/lamal";
import { isRitualComplete } from "@/domain/ritual-steps";
import type { Db } from "@/infrastructure/db/client";
import { lamalPolicy, letter, review, reviewLine } from "@/infrastructure/db/schema";
import { UserError } from "../errors";
import { findReview, ownedReview, type Scope } from "../scope";
import { getReviewView } from "./view";

/** Crée les contrats de l'année cible à partir des décisions, puis clôt la revue. */
export function closeReview(db: Db, scope: Scope, reviewId: number, nowIso: string) {
  const reviewRow = ownedReview(db, scope, reviewId);
  if (reviewRow.status === "CLOSED") return;
  const lines = db.select().from(reviewLine).where(eq(reviewLine.reviewId, reviewId)).all();
  const undecided = lines.filter((l) => l.decision === "UNDECIDED" || l.chosenMonthlyRp === null);
  if (undecided.length) throw new UserError("Toutes les personnes doivent avoir une décision avant la clôture.");
  db.transaction((tx) => {
    for (const l of lines) {
      const prev = tx.select().from(lamalPolicy).where(eq(lamalPolicy.id, l.currentPolicyId)).get()!;
      const existing = tx
        .select()
        .from(lamalPolicy)
        .where(and(eq(lamalPolicy.personId, l.personId), eq(lamalPolicy.coverageYear, reviewRow.targetYear)))
        .get();
      // Saisi à la main (ou importé d'un PDF de police) : c'est le vrai contrat, il est gardé tel quel.
      if (existing?.source === "MANUAL") continue;
      const values = {
        personId: l.personId,
        coverageYear: reviewRow.targetYear,
        insurerId: l.chosenInsurerId!,
        policyNumber: l.decision === "SWITCH" ? null : prev.policyNumber,
        tariffCode: l.chosenTariffCode,
        tariffLabel: l.chosenLabel,
        modelType: (l.chosenModelType ?? prev.modelType) as ModelType,
        franchiseChf: l.chosenFranchiseChf!,
        accident: l.accident,
        billedMonthlyRp: l.chosenMonthlyRp!,
        commune: l.commune,
        bfsNumber: l.bfsNumber,
        canton: l.canton,
        region: l.region,
        source: "REVIEW" as const,
      };
      // Un contrat non saisi à la main (clôture précédente de ce bilan) est remplacé par la décision.
      if (existing) tx.update(lamalPolicy).set(values).where(eq(lamalPolicy.id, existing.id)).run();
      else tx.insert(lamalPolicy).values(values).run();
    }
    tx.update(review).set({ status: "CLOSED", closedAt: nowIso }).where(eq(review.id, reviewId)).run();
  });
}

/**
 * Clôture ou réouverture automatique selon l'avancement : le bilan se clôt quand tout le monde a
 * décidé et que chaque courrier nécessaire est envoyé, et se rouvre si ce n'est plus le cas (envoi
 * annulé). Appelé après chaque action qui peut changer l'avancement ; renvoie ce qui s'est passé.
 */
export function syncReviewClosure(db: Db, scope: Scope, reviewId: number, today: IsoDate, nowIso: string): "closed" | "reopened" | null {
  const reviewRow = findReview(db, scope, reviewId);
  if (!reviewRow) return null;
  const complete = isRitualComplete(getReviewView(db, scope, reviewId, today).steps);
  if (complete && reviewRow.status !== "CLOSED") {
    closeReview(db, scope, reviewId, nowIso);
    return "closed";
  }
  if (!complete && reviewRow.status === "CLOSED") {
    reopenReview(db, scope, reviewId);
    return "reopened";
  }
  return null;
}

/**
 * Annule la clôture : retire les contrats de l'année cible créés par la clôture et rouvre la revue.
 * Les décisions restent, on peut les modifier ; le bilan se clôt à nouveau quand tout est envoyé.
 */
export function reopenReview(db: Db, scope: Scope, reviewId: number) {
  reopenRow(db, ownedReview(db, scope, reviewId));
}

/**
 * Une lettre confiée à Pingen a été refusée : elle redevient à envoyer, donc son bilan, s'il était
 * clôturé, se rouvre. Appelé par la synchronisation Pingen, qui passe sur tous les foyers.
 */
export function reopenReviewOfFailedLetter(db: Db, letterId: number) {
  const row = db.select({ reviewId: letter.reviewId }).from(letter).where(eq(letter.id, letterId)).get();
  const reviewRow = row ? db.select().from(review).where(eq(review.id, row.reviewId)).get() : undefined;
  if (!reviewRow) return;
  try {
    reopenRow(db, reviewRow);
  } catch (error) {
    // Un bilan plus récent s'appuie sur ces contrats : on laisse tel quel, la lettre reste signalée.
    if (!(error instanceof UserError)) throw error;
  }
}

function reopenRow(db: Db, reviewRow: typeof review.$inferSelect) {
  if (reviewRow.status !== "CLOSED") return;
  const created = createdPolicies(db, reviewRow.id, reviewRow.targetYear);
  const ids = created.map((p) => p.id);
  if (ids.length) {
    const usedBy = db.select().from(reviewLine).where(inArray(reviewLine.currentPolicyId, ids)).get();
    if (usedBy) {
      const later = db.select().from(review).where(eq(review.id, usedBy.reviewId)).get()!;
      throw new UserError(`Le bilan ${later.targetYear} s'appuie sur ces contrats : recommencez-le d'abord.`);
    }
  }
  db.transaction((tx) => {
    if (ids.length) tx.delete(lamalPolicy).where(inArray(lamalPolicy.id, ids)).run();
    tx.update(review).set({ status: "OPEN", closedAt: null }).where(eq(review.id, reviewRow.id)).run();
  });
}

/** Supprime le bilan (décisions et lettres comprises), même clôturé : on revient à l'état d'avant. */
export function deleteReview(db: Db, scope: Scope, reviewId: number) {
  const reviewRow = findReview(db, scope, reviewId);
  if (!reviewRow) return;
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
