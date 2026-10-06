/** Ouverture du bilan d'une année : une ligne par personne qui a un contrat l'année en cours. */
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { activeDataset } from "@/infrastructure/db/queries";
import { review, reviewLine } from "@/infrastructure/db/schema";
import { UserError } from "../errors";
import { listPersons } from "../household";
import { householdIdOf, type Scope } from "../scope";
import { renewalFor, currentPolicy } from "./lines";

/**
 * Ouvre (ou rafraîchit) la revue annuelle pour targetYear. Idempotent : les lignes déjà
 * décidées ne sont pas touchées, les autres sont recalculées sur le jeu actif.
 */
export function openReview(db: Db, scope: Scope, targetYear: number): { reviewId: number; skipped: string[] } {
  const householdRow = { id: householdIdOf(scope) };
  const dataset = activeDataset(db, targetYear);
  if (!dataset) throw new UserError(`Les primes ${targetYear} ne sont pas encore importées (Réglages).`);

  let row = db.select().from(review).where(and(eq(review.householdId, householdRow.id), eq(review.targetYear, targetYear))).get();
  if (!row) {
    row = db.insert(review).values({ householdId: householdRow.id, targetYear, datasetId: dataset.id, status: "OPEN" }).returning().get();
  } else if (row.datasetId !== dataset.id && row.status !== "CLOSED") {
    db.update(review).set({ datasetId: dataset.id }).where(eq(review.id, row.id)).run();
    row = { ...row, datasetId: dataset.id };
  }
  if (row.status === "CLOSED") return { reviewId: row.id, skipped: [] };

  const persons = listPersons(db, householdRow.id);
  if (!persons.some((p) => currentPolicy(db, p.id, targetYear - 1))) {
    db.delete(review).where(and(eq(review.id, row.id), eq(review.status, "OPEN"))).run();
    throw new UserError(`Indiquez d'abord ${persons.length > 1 ? "les contrats" : "votre contrat"} ${targetYear - 1}.`);
  }
  const skipped: string[] = [];
  for (const p of persons) {
    const policy = currentPolicy(db, p.id, targetYear - 1);
    if (!policy) {
      skipped.push(`${p.firstName} ${p.lastName} (pas de contrat ${targetYear - 1})`);
      continue;
    }
    const computed = renewalFor(db, row, p, policy);
    const existing = db
      .select()
      .from(reviewLine)
      .where(and(eq(reviewLine.reviewId, row.id), eq(reviewLine.personId, p.id)))
      .get();
    if (!existing) {
      db.insert(reviewLine).values({ reviewId: row.id, personId: p.id, currentPolicyId: policy.id, ...computed }).run();
    } else if (existing.decision === "UNDECIDED") {
      db.update(reviewLine).set({ currentPolicyId: policy.id, ...computed }).where(eq(reviewLine.id, existing.id)).run();
    }
  }
  return { reviewId: row.id, skipped };
}

/**
 * Ouvre le bilan de l'année cible si c'est possible : primes de l'année cible importées et au
 * moins un contrat de l'année en cours. Retourne son id, sinon null. Ne vérifie pas la fenêtre du
 * bilan (`isReviewWindowOpen`) : c'est à l'appelant de le faire.
 */
export function openReviewIfPossible(db: Db, scope: Scope, targetYear: number): number | null {
  const existing = getReviewByYear(db, scope, targetYear);
  if (existing) return existing.id;
  if (scope.householdId === null || !activeDataset(db, targetYear)) return null;
  const anyContract = listPersons(db, scope.householdId).some((p) => currentPolicy(db, p.id, targetYear - 1));
  return anyContract ? openReview(db, scope, targetYear).reviewId : null;
}

/**
 * Bilan en cours : le dernier non clôturé, quelle que soit l'année (en décembre et janvier,
 * l'année civile a changé mais les confirmations et la clôture restent à faire).
 */
export function activeReview(db: Db, scope: Scope) {
  if (scope.householdId === null) return null;
  return db.select().from(review).where(and(eq(review.householdId, scope.householdId), eq(review.status, "OPEN"))).orderBy(desc(review.targetYear)).get() ?? null;
}

/** Bilan du foyer pour une année cible, quel que soit son statut ; null s'il n'existe pas. */
export function getReviewByYear(db: Db, scope: Scope, targetYear: number) {
  if (scope.householdId === null) return null;
  return db.select().from(review).where(and(eq(review.householdId, scope.householdId), eq(review.targetYear, targetYear))).get() ?? null;
}
