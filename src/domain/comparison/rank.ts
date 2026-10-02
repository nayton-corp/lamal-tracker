import type { AgeClass } from "../age-class";
import { costInputFor, expectedAnnualCost, worstCaseAnnualCost, type CostBreakdown } from "../cost-model";
import type { ModelType } from "../insurance-model";
import { allowedFranchises, coinsuranceMax, type LamalParameters } from "../lamal-parameters";
import type { Rappen } from "../money";
import type { Tariff } from "../tariff";

export type SortKey = "expectedCost" | "premium" | "worstCase";

export interface ComparisonCriteria {
  ageClass: AgeClass;
  accidentIncluded: boolean;
  /** Vide = tous les modèles. */
  allowedModels: readonly ModelType[];
  /** Vide = toutes les franchises légales de la classe d'âge. */
  allowedFranchises: readonly number[];
  excludedInsurerIds: readonly number[];
  healthCostsRp: Rappen;
  co2AnnualRp: Rappen | null;
  sortBy: SortKey;
  /** Sous-groupe d'âge à retenir (rabais enfants) ; vide = tarif principal. */
  ageSubgroup?: string;
}

export interface Reference {
  monthlyPremiumRp: Rappen;
  franchiseChf: number;
}

export interface RankedOffer {
  tariff: Tariff;
  rank: number;
  cost: CostBreakdown;
  worstCaseRp: Rappen;
  /** Économie annuelle attendue par rapport à la référence (positif = moins cher). */
  annualSavingRp: Rappen | null;
  /** Économie de prime seule (12 × différence mensuelle). */
  premiumSavingRp: Rappen | null;
}

export function filterTariffs(tariffs: readonly Tariff[], params: LamalParameters, criteria: ComparisonCriteria): Tariff[] {
  const legal = new Set(allowedFranchises(params, criteria.ageClass));
  const franchises = criteria.allowedFranchises.length > 0 ? new Set(criteria.allowedFranchises) : legal;
  const models = new Set(criteria.allowedModels);
  const excluded = new Set(criteria.excludedInsurerIds);
  const subgroup = criteria.ageSubgroup ?? "";
  return tariffs.filter(
    (t) =>
      t.ageClass === criteria.ageClass &&
      t.accidentIncluded === criteria.accidentIncluded &&
      (t.ageSubgroup ?? "") === subgroup &&
      legal.has(t.franchiseChf) &&
      franchises.has(t.franchiseChf) &&
      (models.size === 0 || models.has(t.modelType)) &&
      !excluded.has(t.insurerId),
  );
}

export function rankOffers(
  tariffs: readonly Tariff[],
  params: LamalParameters,
  criteria: ComparisonCriteria,
  reference: Reference | null,
): RankedOffer[] {
  const filtered = filterTariffs(tariffs, params, criteria);
  const qpMax = coinsuranceMax(params, criteria.ageClass);
  const referenceCost = reference
    ? expectedAnnualCost(
        costInputFor(params, criteria.ageClass, reference.monthlyPremiumRp, reference.franchiseChf, criteria.healthCostsRp, criteria.co2AnnualRp),
      ).totalRp
    : null;
  const scored = filtered.map((tariff) => {
    const cost = expectedAnnualCost(
      costInputFor(params, criteria.ageClass, tariff.monthlyPremiumRp, tariff.franchiseChf, criteria.healthCostsRp, criteria.co2AnnualRp),
    );
    const worstCaseRp = worstCaseAnnualCost({
      monthlyPremiumRp: tariff.monthlyPremiumRp,
      franchiseChf: tariff.franchiseChf,
      coinsuranceRateBp: params.coinsuranceRateBp,
      coinsuranceMaxRp: qpMax,
      co2AnnualRp: criteria.co2AnnualRp,
    });
    return {
      tariff,
      rank: 0,
      cost,
      worstCaseRp,
      annualSavingRp: referenceCost === null ? null : referenceCost - cost.totalRp,
      premiumSavingRp: reference ? (reference.monthlyPremiumRp - tariff.monthlyPremiumRp) * 12 : null,
    };
  });
  const key = (o: RankedOffer): number =>
    criteria.sortBy === "premium" ? o.tariff.monthlyPremiumRp : criteria.sortBy === "worstCase" ? o.worstCaseRp : o.cost.totalRp;
  scored.sort(
    (a, b) =>
      key(a) - key(b) ||
      a.tariff.monthlyPremiumRp - b.tariff.monthlyPremiumRp ||
      a.tariff.insurerName.localeCompare(b.tariff.insurerName, "fr") ||
      a.tariff.tariffCode.localeCompare(b.tariff.tariffCode) ||
      a.tariff.franchiseChf - b.tariff.franchiseChf ||
      a.tariff.id - b.tariff.id,
  );
  scored.forEach((o, i) => {
    o.rank = i + 1;
  });
  return scored;
}

/** Ne garde que la meilleure franchise de chaque produit (une carte par produit dans le comparateur). */
export function bestPerProduct(offers: readonly RankedOffer[]): RankedOffer[] {
  const seen = new Set<string>();
  const result: RankedOffer[] = [];
  for (const offer of offers) {
    const key = `${offer.tariff.insurerId}:${offer.tariff.tariffCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(offer);
  }
  return result.map((o, i) => ({ ...o, rank: i + 1 }));
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
  const median = sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  return { count: sorted.length, minRp: sorted[0]!, medianRp: median, maxRp: sorted[sorted.length - 1]! };
}

/** Rang (1 = moins cher) d'une prime dans une liste de primes, et nombre total. */
export function marketRank(premiumsRp: readonly Rappen[], premiumRp: Rappen): { rank: number; total: number } {
  const cheaper = premiumsRp.filter((p) => p < premiumRp).length;
  return { rank: cheaper + 1, total: premiumsRp.length };
}

/** Phrases courtes qui expliquent la position d'une offre par rapport à la référence. */
export function explainOffer(offer: RankedOffer, reference: Reference | null): string[] {
  const reasons: string[] = [];
  if (reference) {
    if (offer.tariff.franchiseChf !== reference.franchiseChf) {
      reasons.push(`Franchise ${offer.tariff.franchiseChf} au lieu de ${reference.franchiseChf}.`);
    }
    if (offer.premiumSavingRp !== null && offer.annualSavingRp !== null && offer.premiumSavingRp !== offer.annualSavingRp) {
      reasons.push("L'écart de franchise et de quote-part est inclus dans le coût total estimé.");
    }
  }
  if (offer.tariff.modelType !== "STANDARD") {
    reasons.push("Modèle alternatif : premier recours obligatoire (médecin, centre ou téléphone).");
  }
  return reasons;
}
