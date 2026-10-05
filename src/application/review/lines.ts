/** Outils partagés par les fichiers du rituel : types de lignes, offres de l'année cible, prime reconduite. */
import { and, eq } from "drizzle-orm";
import { ageClassForYear } from "@/domain/age";
import { subgroupFor, type ModelType } from "@/domain/lamal";
import { franchisesFor } from "@/domain/parameters";
import { findRenewal } from "@/domain/renewal";
import type { Db } from "@/infrastructure/db/client";
import { offersFor, parametersFor } from "@/infrastructure/db/queries";
import { household, lamalPolicy, letter, person, review, reviewLine, tariffLineage } from "@/infrastructure/db/schema";
import { UserError } from "../errors";
import { ownedLine, type Scope } from "../scope";

export type LineRow = typeof reviewLine.$inferSelect;

export type PersonRow = typeof person.$inferSelect;

export type PolicyRow = typeof lamalPolicy.$inferSelect;

/** Profil de primes d'une ligne : région du foyer de la revue, classe d'âge, accident. */
export function premiumProfileFor(db: Db, reviewRow: typeof review.$inferSelect, line: Pick<LineRow, "targetAgeClass" | "accident" | "subgroup">) {
  const householdRow = db.select().from(household).where(eq(household.id, reviewRow.householdId)).get();
  if (!householdRow) throw new UserError("Foyer non configuré.");
  return {
    datasetId: reviewRow.datasetId,
    canton: householdRow.canton,
    region: householdRow.region,
    ageClass: line.targetAgeClass,
    accident: line.accident,
    subgroup: line.subgroup,
  };
}

export function renewalFor(db: Db, reviewRow: typeof review.$inferSelect, p: PersonRow, policy: PolicyRow) {
  const ageClass = ageClassForYear(p.birthDate, reviewRow.targetYear);
  const subgroup = subgroupFor(ageClass, p.kidSubgroup);
  const accident = policy.accident;
  const params = parametersFor(db, reviewRow.targetYear);
  const offers = offersFor(db, premiumProfileFor(db, reviewRow, { targetAgeClass: ageClass, accident, subgroup }));
  const lineage = policy.tariffCode
    ? db
        .select()
        .from(tariffLineage)
        .where(
          and(
            eq(tariffLineage.householdId, reviewRow.householdId),
            eq(tariffLineage.insurerId, policy.insurerId),
            eq(tariffLineage.fromYear, reviewRow.targetYear - 1),
            eq(tariffLineage.fromCode, policy.tariffCode),
            eq(tariffLineage.toYear, reviewRow.targetYear),
          ),
        )
        .get()
    : undefined;
  const result = findRenewal(
    { insurerId: policy.insurerId, tariffCode: policy.tariffCode, tariffLabel: policy.tariffLabel, modelType: policy.modelType as ModelType, franchiseChf: policy.franchiseChf },
    offers,
    franchisesFor(params, ageClass),
    lineage?.toCode ?? null,
  );
  return {
    targetAgeClass: ageClass,
    accident,
    subgroup,
    renewalStatus: result.status,
    renewalTariffCode: result.offer?.tariffCode ?? null,
    renewalLabel: result.offer?.tariffLabel ?? null,
    renewalFranchiseChf: result.franchiseChf,
    renewalMonthlyRp: result.offer?.monthlyPremiumRp ?? null,
  };
}

export function currentPolicy(db: Db, personId: number, year: number) {
  return db.select().from(lamalPolicy).where(and(eq(lamalPolicy.personId, personId), eq(lamalPolicy.coverageYear, year))).get() ?? null;
}

export function loadLine(db: Db, scope: Scope, lineId: number) {
  const line = ownedLine(db, scope, lineId);
  const r = db.select().from(review).where(eq(review.id, line.reviewId)).get()!;
  const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const personRow = db.select().from(person).where(eq(person.id, line.personId)).get()!;
  if (r.status === "CLOSED") throw new UserError("Cette revue est clôturée.");
  return { line, review: r, policy, person: personRow };
}

export function linesWithSentLetter(db: Db, reviewId: number): Set<number> {
  const sent = db.select().from(letter).where(eq(letter.reviewId, reviewId)).all().filter((l) => l.sentAt);
  return new Set(sent.flatMap((l) => l.lineIds));
}
