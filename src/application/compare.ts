import { ageClassFor, type AgeClass } from "@/domain/age-class";
import { bestPerProduct, explainOffer, marketStats, rankOffers, type ComparisonCriteria, type SortKey } from "@/domain/comparison/rank";
import { MODEL_TYPES, type ModelType } from "@/domain/insurance-model";
import { allowedFranchises, closestAllowedFranchise } from "@/domain/lamal-parameters";
import type { AppContext } from "./context";

export interface FreeCompareQuery {
  year?: number;
  personId?: number;
  ageClass?: AgeClass;
  accidentIncluded?: boolean;
  franchiseChf?: number;
  models?: ModelType[];
  healthCostsRp?: number;
  sortBy?: SortKey;
  limit?: number;
}

/**
 * Comparateur libre (hors rituel) : marché d'une année active pour la région du foyer,
 * pour un membre du foyer ou une classe d'âge choisie.
 */
export function freeComparison(ctx: AppContext, q: FreeCompareQuery) {
  const household = ctx.household.household();
  const years = ctx.tariffs.activeYears().sort((a, b) => b - a);
  if (!household || years.length === 0) return { status: "unavailable" as const, household, years };
  const year = q.year && years.includes(q.year) ? q.year : years[0]!;
  const dataset = ctx.tariffs.activeDataset(year)!;
  const person = q.personId ? ctx.household.person(q.personId) : undefined;
  const prefs = person ? ctx.household.prefs(person.id) : undefined;
  const ageClass = person ? ageClassFor(person.birthDate, year) : (q.ageClass ?? "ADULT");
  const params = ctx.reference.parameters(year);
  const legal = allowedFranchises(params, ageClass);
  const franchise = q.franchiseChf !== undefined ? closestAllowedFranchise(params, ageClass, q.franchiseChf) : null;
  const accident = q.accidentIncluded ?? prefs?.accidentIncluded ?? false;
  const criteria: ComparisonCriteria = {
    ageClass,
    accidentIncluded: accident,
    allowedModels: q.models?.length ? q.models : ((prefs?.allowedModels as ModelType[] | undefined) ?? []),
    allowedFranchises: franchise !== null ? [franchise] : (prefs?.allowedFranchises ?? []),
    excludedInsurerIds: prefs?.excludedInsurers ?? [],
    healthCostsRp: q.healthCostsRp ?? prefs?.expectedHealthCostsRp ?? 100_000,
    co2AnnualRp: ctx.reference.co2(year)?.annualAmountRp ?? null,
    sortBy: q.sortBy ?? "expectedCost",
    ageSubgroup: ctx.tariffs.defaultSubgroup(dataset.id, ageClass),
  };
  const tariffs = ctx.tariffs.tariffs({ datasetId: dataset.id, canton: household.canton, region: household.region, ageClass, accidentIncluded: accident });
  const all = bestPerProduct(rankOffers(tariffs, params, criteria, null));
  const market = franchise !== null ? marketStats(all.map((o) => o.tariff.monthlyPremiumRp)) : null;
  return {
    status: "ok" as const,
    household,
    years,
    year,
    person,
    ageClass,
    accident,
    franchise,
    legal,
    criteria,
    market,
    total: all.length,
    offers: all.slice(0, q.limit ?? 30).map((o) => ({ ...o, reasons: explainOffer(o, null) })),
    models: MODEL_TYPES,
  };
}
