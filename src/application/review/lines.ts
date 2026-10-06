/** Outils partagés par les fichiers du bilan : types de lignes, offres de l'année cible, prime reconduite. */
import { and, eq } from "drizzle-orm";
import { ageClassForYear } from "@/domain/age";
import { domicileOf, type Domicile } from "@/domain/domicile";
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

/** Profil de primes d'une ligne : domicile de la personne au 1er janvier de l'année cible, classe d'âge, accident. */
export function premiumProfileFor(reviewRow: typeof review.$inferSelect, line: Pick<LineRow, "targetAgeClass" | "accident" | "subgroup" | "canton" | "region">) {
  return {
    datasetId: reviewRow.datasetId,
    canton: line.canton,
    region: line.region,
    ageClass: line.targetAgeClass,
    accident: line.accident,
    subgroup: line.subgroup,
  };
}

/** Adresse actuelle du foyer de la revue, domicile proposé par défaut pour l'année cible. */
export function householdDomicile(db: Db, householdId: number): Domicile {
  const householdRow = db.select().from(household).where(eq(household.id, householdId)).get();
  if (!householdRow) throw new UserError("Foyer non configuré.");
  return domicileOf(householdRow);
}

/**
 * Prime reconduite d'une personne pour l'année cible : classe d'âge et sous-groupe de cette année,
 * tarif successeur (avec la correspondance déjà confirmée par le foyer). Renvoie les colonnes à
 * enregistrer sur la ligne, domicile compris.
 */
export function renewalFor(db: Db, reviewRow: typeof review.$inferSelect, p: PersonRow, policy: PolicyRow, domicile: Domicile) {
  const ageClass = ageClassForYear(p.birthDate, reviewRow.targetYear);
  const subgroup = subgroupFor(ageClass, p.kidSubgroup);
  const accident = policy.accident;
  const params = parametersFor(db, reviewRow.targetYear);
  const offers = offersFor(db, premiumProfileFor(reviewRow, { targetAgeClass: ageClass, accident, subgroup, canton: domicile.canton, region: domicile.region }));
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
    ...domicile,
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

/** Contrat LAMal de la personne pour une année ; null s'il n'y en a pas. */
export function currentPolicy(db: Db, personId: number, year: number) {
  return db.select().from(lamalPolicy).where(and(eq(lamalPolicy.personId, personId), eq(lamalPolicy.coverageYear, year))).get() ?? null;
}

/** Ligne du foyer avec sa revue, son contrat et sa personne ; refusée si la revue est clôturée. */
export function loadLine(db: Db, scope: Scope, lineId: number) {
  const line = ownedLine(db, scope, lineId);
  const r = db.select().from(review).where(eq(review.id, line.reviewId)).get()!;
  const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const personRow = db.select().from(person).where(eq(person.id, line.personId)).get()!;
  if (r.status === "CLOSED") throw new UserError("Cette revue est clôturée.");
  return { line, review: r, policy, person: personRow };
}

/** Lignes couvertes par une lettre déjà envoyée : leur décision ne peut plus changer. */
export function linesWithSentLetter(db: Db, reviewId: number): Set<number> {
  const sent = db.select().from(letter).where(eq(letter.reviewId, reviewId)).all().filter((l) => l.sentAt);
  return new Set(sent.flatMap((l) => l.lineIds));
}
