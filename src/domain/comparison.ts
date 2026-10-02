import { annualCost, type CostBreakdown } from "./cost";
import type { AgeClass, ModelType } from "./lamal";
import { requiresDoctorCheck } from "./lamal";
import type { Rappen } from "./money";
import { coinsuranceMaxFor, type LamalParameters } from "./parameters";

export interface Offer {
  tariffId: number;
  insurerId: number;
  insurerName: string;
  tariffCode: string;
  tariffLabel: string;
  modelType: ModelType;
  franchiseChf: number;
  accident: boolean;
  monthlyPremiumRp: Rappen;
}

export interface OfferFilters {
  models?: readonly ModelType[];
  franchises?: readonly number[];
  excludedInsurerIds?: readonly number[];
}

export interface RankingContext {
  ageClass: AgeClass;
  params: LamalParameters;
  healthCostsRp: Rappen;
  /** Coût annuel attendu du renouvellement chez l'assureur actuel, pour les économies. */
  referenceTotalRp: Rappen | null;
}

export type SortKey = "total" | "premium";

export interface RankedOffer extends Offer {
  rank: number;
  cost: CostBreakdown;
  /** Positif = économie annuelle par rapport au renouvellement. */
  savingsRp: Rappen | null;
  doctorCheck: boolean;
}

export function filterOffers(offers: readonly Offer[], filters: OfferFilters): Offer[] {
  return offers.filter(
    (o) =>
      (!filters.models?.length || filters.models.includes(o.modelType)) &&
      (!filters.franchises?.length || filters.franchises.includes(o.franchiseChf)) &&
      !filters.excludedInsurerIds?.includes(o.insurerId),
  );
}

export function costOf(offer: Pick<Offer, "monthlyPremiumRp" | "franchiseChf">, ctx: Omit<RankingContext, "referenceTotalRp">): CostBreakdown {
  return annualCost({
    monthlyPremiumRp: offer.monthlyPremiumRp,
    franchiseChf: offer.franchiseChf,
    healthCostsRp: ctx.healthCostsRp,
    coinsuranceRateBp: ctx.params.coinsuranceRateBp,
    coinsuranceMaxRp: coinsuranceMaxFor(ctx.params, ctx.ageClass),
    co2AnnualRp: ctx.params.co2AnnualRp,
  });
}

/**
 * Classe les offres : coût total attendu (prime + participation) ou prime seule.
 * Tri stable et déterministe : à égalité, la prime puis le nom de l'assureur départagent.
 */
export function rankOffers(
  offers: readonly Offer[],
  ctx: RankingContext,
  sort: SortKey = "total",
): RankedOffer[] {
  const enriched = offers.map((o) => {
    const cost = costOf(o, ctx);
    return {
      ...o,
      cost,
      savingsRp: ctx.referenceTotalRp === null ? null : ctx.referenceTotalRp - cost.totalRp,
      doctorCheck: requiresDoctorCheck(o.modelType),
      rank: 0,
    };
  });
  const key = (o: RankedOffer) => (sort === "total" ? o.cost.totalRp : o.monthlyPremiumRp);
  enriched.sort(
    (a, b) =>
      key(a) - key(b) ||
      a.monthlyPremiumRp - b.monthlyPremiumRp ||
      a.insurerName.localeCompare(b.insurerName, "fr") ||
      a.tariffCode.localeCompare(b.tariffCode),
  );
  enriched.forEach((o, i) => (o.rank = i + 1));
  return enriched;
}

/** Meilleure offre (prime la plus basse) par franchise, pour le simulateur. */
export function cheapestPerFranchise(offers: readonly Offer[]): Offer[] {
  const best = new Map<number, Offer>();
  for (const o of offers) {
    const current = best.get(o.franchiseChf);
    if (!current || o.monthlyPremiumRp < current.monthlyPremiumRp) best.set(o.franchiseChf, o);
  }
  return [...best.values()].sort((a, b) => a.franchiseChf - b.franchiseChf);
}

export interface MarketStats {
  count: number;
  minRp: Rappen;
  medianRp: Rappen;
  maxRp: Rappen;
}

export function marketStats(premiumsRp: readonly Rappen[]): MarketStats | null {
  if (premiumsRp.length === 0) return null;
  const sorted = [...premiumsRp].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  return { count: sorted.length, minRp: sorted[0]!, medianRp: median, maxRp: sorted.at(-1)! };
}

/** Rang (1 = moins cher) d'une prime dans le marché, en percentile entier 0–100. */
export function percentileOf(premiumRp: Rappen, premiumsRp: readonly Rappen[]): number | null {
  if (premiumsRp.length === 0) return null;
  const cheaper = premiumsRp.filter((p) => p < premiumRp).length;
  return Math.round((cheaper * 100) / premiumsRp.length);
}

/**
 * Garde la meilleure offre de chaque caisse (la première dans l'ordre du classement) et
 * renumérote : une caisse = une ligne, comme dans les comparateurs grand public.
 */
export function bestPerInsurer(ranked: readonly RankedOffer[]): RankedOffer[] {
  const seen = new Set<number>();
  const out: RankedOffer[] = [];
  for (const o of ranked) {
    if (seen.has(o.insurerId)) continue;
    seen.add(o.insurerId);
    out.push({ ...o, rank: out.length + 1 });
  }
  return out;
}
