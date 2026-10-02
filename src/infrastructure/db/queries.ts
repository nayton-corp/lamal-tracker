import { and, desc, eq } from "drizzle-orm";
import type { Offer } from "@/domain/comparison";
import type { AgeClass, ModelType } from "@/domain/lamal";
import { defaultParameters, type LamalParameters } from "@/domain/parameters";
import type { Db } from "./client";
import { insurer, lamalParameters, premium, tariff, tariffDataset } from "./schema";

export interface OfferScope {
  datasetId: number;
  canton: string;
  region: number;
  ageClass: AgeClass;
  accident: boolean;
  subgroup: string;
}

/** Toutes les offres d'un profil (canton, région, classe d'âge, accident, sous-groupe). */
export function offersFor(db: Db, scope: OfferScope): Offer[] {
  return db
    .select({
      tariffId: tariff.id,
      insurerId: insurer.id,
      insurerName: insurer.name,
      displayName: insurer.displayName,
      tariffCode: tariff.code,
      tariffLabel: tariff.label,
      modelType: tariff.modelType,
      franchiseChf: premium.franchiseChf,
      accident: premium.accident,
      monthlyPremiumRp: premium.monthlyRp,
    })
    .from(premium)
    .innerJoin(tariff, eq(premium.tariffId, tariff.id))
    .innerJoin(insurer, eq(tariff.insurerId, insurer.id))
    .where(
      and(
        eq(premium.datasetId, scope.datasetId),
        eq(premium.canton, scope.canton),
        eq(premium.region, scope.region),
        eq(premium.ageClass, scope.ageClass),
        eq(premium.accident, scope.accident),
        eq(premium.subgroup, scope.subgroup),
      ),
    )
    .all()
    .map(({ displayName, ...o }) => ({
      ...o,
      insurerName: displayName || o.insurerName,
      modelType: o.modelType as ModelType,
    }));
}

export function activeDataset(db: Db, year: number) {
  return db
    .select()
    .from(tariffDataset)
    .where(and(eq(tariffDataset.year, year), eq(tariffDataset.status, "ACTIVE")))
    .get();
}

export function latestActiveYear(db: Db): number | null {
  return (
    db
      .select({ year: tariffDataset.year })
      .from(tariffDataset)
      .where(eq(tariffDataset.status, "ACTIVE"))
      .orderBy(desc(tariffDataset.year))
      .get()?.year ?? null
  );
}

export function parametersFor(db: Db, year: number): LamalParameters {
  const row = db.select().from(lamalParameters).where(eq(lamalParameters.year, year)).get();
  if (!row) return defaultParameters(year);
  return {
    year: row.year,
    franchisesAdult: row.franchisesAdult,
    franchisesKid: row.franchisesKid,
    coinsuranceRateBp: row.coinsuranceRateBp,
    coinsuranceMaxAdultRp: row.coinsuranceMaxAdultRp,
    coinsuranceMaxKidRp: row.coinsuranceMaxKidRp,
    co2AnnualRp: row.co2AnnualRp,
  };
}

export function insurerLabel(row: { name: string; displayName: string | null }): string {
  return row.displayName || row.name;
}
