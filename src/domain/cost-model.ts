import type { AgeClass } from "./age-class";
import { allowedFranchises, coinsuranceMax, type LamalParameters } from "./lamal-parameters";
import type { Rappen } from "./money";

export interface CostInput {
  monthlyPremiumRp: Rappen;
  franchiseChf: number;
  /** Frais de santé annuels attendus (factures avant participation). */
  healthCostsRp: Rappen;
  coinsuranceRateBp: number;
  coinsuranceMaxRp: Rappen;
  /** Redistribution annuelle CO2/COV par personne (null = inconnue). */
  co2AnnualRp: Rappen | null;
}

export interface CostBreakdown {
  premiumsRp: Rappen;
  franchisePartRp: Rappen;
  coinsurancePartRp: Rappen;
  /** Participation aux coûts = franchise + quote-part. */
  costSharingRp: Rappen;
  co2Rp: Rappen;
  /** Primes − redistribution CO2. */
  netPremiumsRp: Rappen;
  /** Coût annuel attendu : primes + participation − redistribution. */
  totalRp: Rappen;
}

/**
 * coût(t, D) = 12·prime(t) + min(D, F) + min(taux·max(D−F, 0), QPmax) − CO2annuel
 */
export function expectedAnnualCost(input: CostInput): CostBreakdown {
  const franchiseRp = input.franchiseChf * 100;
  const premiumsRp = input.monthlyPremiumRp * 12;
  const health = Math.max(0, input.healthCostsRp);
  const franchisePartRp = Math.min(health, franchiseRp);
  const above = Math.max(health - franchiseRp, 0);
  const coinsurancePartRp = Math.min(Math.round((above * input.coinsuranceRateBp) / 10_000), input.coinsuranceMaxRp);
  const co2Rp = input.co2AnnualRp ?? 0;
  const costSharingRp = franchisePartRp + coinsurancePartRp;
  return {
    premiumsRp,
    franchisePartRp,
    coinsurancePartRp,
    costSharingRp,
    co2Rp,
    netPremiumsRp: premiumsRp - co2Rp,
    totalRp: premiumsRp + costSharingRp - co2Rp,
  };
}

/** Coût maximal possible sur l'année (franchise et quote-part entièrement consommées). */
export function worstCaseAnnualCost(input: Omit<CostInput, "healthCostsRp">): Rappen {
  return input.monthlyPremiumRp * 12 + input.franchiseChf * 100 + input.coinsuranceMaxRp - (input.co2AnnualRp ?? 0);
}

export function costInputFor(
  params: LamalParameters,
  ageClass: AgeClass,
  monthlyPremiumRp: Rappen,
  franchiseChf: number,
  healthCostsRp: Rappen,
  co2AnnualRp: Rappen | null,
): CostInput {
  return {
    monthlyPremiumRp,
    franchiseChf,
    healthCostsRp,
    coinsuranceRateBp: params.coinsuranceRateBp,
    coinsuranceMaxRp: coinsuranceMax(params, ageClass),
    co2AnnualRp,
  };
}

export interface FranchiseOption {
  franchiseChf: number;
  monthlyPremiumRp: Rappen;
}

export interface FranchiseCurvePoint {
  healthCostsRp: Rappen;
  /** Coût total par franchise, indexé par franchise en CHF. */
  costs: Record<number, Rappen>;
  bestFranchiseChf: number;
}

/**
 * Courbe « coût total selon les frais de santé » pour chaque franchise d'un même produit,
 * utilisée par le simulateur de franchise.
 */
export function franchiseCurve(
  options: readonly FranchiseOption[],
  params: LamalParameters,
  ageClass: AgeClass,
  maxHealthCostsRp: Rappen,
  steps = 40,
): FranchiseCurvePoint[] {
  const points: FranchiseCurvePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const healthCostsRp = Math.round((maxHealthCostsRp * i) / steps);
    const costs: Record<number, Rappen> = {};
    let best: { f: number; cost: number } | null = null;
    for (const option of options) {
      const cost = expectedAnnualCost(costInputFor(params, ageClass, option.monthlyPremiumRp, option.franchiseChf, healthCostsRp, null)).totalRp;
      costs[option.franchiseChf] = cost;
      if (!best || cost < best.cost || (cost === best.cost && option.franchiseChf < best.f)) {
        best = { f: option.franchiseChf, cost };
      }
    }
    points.push({ healthCostsRp, costs, bestFranchiseChf: best?.f ?? 0 });
  }
  return points;
}

export interface FranchiseRecommendation {
  franchiseChf: number;
  totalRp: Rappen;
  /** Économie par rapport à la pire franchise pour ces frais attendus. */
  savingVsWorstRp: Rappen;
  /**
   * Seuil de frais de santé au-delà duquel une franchise plus basse devient avantageuse
   * (null si la franchise recommandée est déjà la plus basse).
   */
  switchBelowAtRp: Rappen | null;
}

/** Franchise optimale pour des frais attendus, et seuil de bascule vers la franchise inférieure. */
export function recommendFranchise(
  options: readonly FranchiseOption[],
  params: LamalParameters,
  ageClass: AgeClass,
  healthCostsRp: Rappen,
): FranchiseRecommendation | null {
  const allowed = new Set(allowedFranchises(params, ageClass));
  const usable = options.filter((o) => allowed.has(o.franchiseChf));
  if (usable.length === 0) return null;
  const costOf = (o: FranchiseOption, d: Rappen) =>
    expectedAnnualCost(costInputFor(params, ageClass, o.monthlyPremiumRp, o.franchiseChf, d, null)).totalRp;
  const scored = usable.map((o) => ({ o, total: costOf(o, healthCostsRp) })).sort((a, b) => a.total - b.total || a.o.franchiseChf - b.o.franchiseChf);
  const best = scored[0]!;
  const worst = scored[scored.length - 1]!;
  // Recherche du seuil où une franchise plus basse devient moins chère que la recommandée.
  let switchBelowAtRp: Rappen | null = null;
  const lower = usable.filter((o) => o.franchiseChf < best.o.franchiseChf);
  if (lower.length > 0) {
    let lo = healthCostsRp;
    let hi = Math.max(healthCostsRp, 1) * 4 + 1_000_000;
    const cheaperLowerExists = (d: Rappen) => lower.some((o) => costOf(o, d) < costOf(best.o, d));
    if (cheaperLowerExists(hi)) {
      while (hi - lo > 100) {
        const mid = Math.floor((lo + hi) / 2);
        if (cheaperLowerExists(mid)) hi = mid;
        else lo = mid;
      }
      switchBelowAtRp = hi;
    }
  }
  return {
    franchiseChf: best.o.franchiseChf,
    totalRp: best.total,
    savingVsWorstRp: worst.total - best.total,
    switchBelowAtRp,
  };
}
