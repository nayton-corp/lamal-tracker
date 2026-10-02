import type { Rappen } from "./money";

export interface CostInput {
  monthlyPremiumRp: Rappen;
  franchiseChf: number;
  /** Frais de santé annuels attendus (factures avant participation). */
  healthCostsRp: Rappen;
  coinsuranceRateBp: number;
  coinsuranceMaxRp: Rappen;
  co2AnnualRp: Rappen | null;
}

export interface CostBreakdown {
  grossPremiumRp: Rappen;
  co2Rp: Rappen;
  netPremiumRp: Rappen;
  franchisePartRp: Rappen;
  coinsurancePartRp: Rappen;
  totalRp: Rappen;
}

/**
 * Coût annuel attendu d'une offre :
 *   12 × prime brute − redistribution CO2 + min(frais, franchise)
 *   + min(10 % des frais au-delà de la franchise, plafond de quote-part)
 * La contribution hospitalière (15 CHF/jour) est hors modèle.
 */
export function annualCost(input: CostInput): CostBreakdown {
  const franchiseRp = input.franchiseChf * 100;
  const grossPremiumRp = input.monthlyPremiumRp * 12;
  const co2Rp = input.co2AnnualRp ?? 0;
  const franchisePartRp = Math.min(Math.max(input.healthCostsRp, 0), franchiseRp);
  const above = Math.max(input.healthCostsRp - franchiseRp, 0);
  const coinsurancePartRp = Math.min(
    Math.round((above * input.coinsuranceRateBp) / 10000),
    input.coinsuranceMaxRp,
  );
  const netPremiumRp = grossPremiumRp - co2Rp;
  return {
    grossPremiumRp,
    co2Rp,
    netPremiumRp,
    franchisePartRp,
    coinsurancePartRp,
    totalRp: netPremiumRp + franchisePartRp + coinsurancePartRp,
  };
}

export interface FranchiseOption {
  franchiseChf: number;
  monthlyPremiumRp: Rappen;
}

export interface CurvePoint {
  healthCostsRp: Rappen;
  /** Coût total par franchise, dans l'ordre des options. */
  totals: Rappen[];
  bestFranchiseChf: number;
}

/** Courbes de coût total par franchise sur une plage de frais de santé. */
export function franchiseCurve(
  options: FranchiseOption[],
  base: Omit<CostInput, "monthlyPremiumRp" | "franchiseChf" | "healthCostsRp">,
  maxHealthCostsRp: Rappen,
  stepRp: Rappen,
): CurvePoint[] {
  if (options.length === 0) return [];
  const points: CurvePoint[] = [];
  for (let h = 0; h <= maxHealthCostsRp; h += stepRp) {
    const totals = options.map(
      (o) => annualCost({ ...base, ...o, healthCostsRp: h }).totalRp,
    );
    const bestIdx = totals.indexOf(Math.min(...totals));
    points.push({ healthCostsRp: h, totals, bestFranchiseChf: options[bestIdx]!.franchiseChf });
  }
  return points;
}

/**
 * Plus petit montant de frais (au franc près) à partir duquel la franchise la plus basse
 * devient la moins chère. null si elle ne l'est jamais sur la plage.
 */
export function breakEvenRp(
  options: FranchiseOption[],
  base: Omit<CostInput, "monthlyPremiumRp" | "franchiseChf" | "healthCostsRp">,
  maxHealthCostsRp: Rappen = 2_000_000,
): Rappen | null {
  if (options.length < 2) return null;
  const sorted = [...options].sort((a, b) => a.franchiseChf - b.franchiseChf);
  const lowest = sorted[0]!;
  const isLowestBest = (h: Rappen) => {
    const low = annualCost({ ...base, ...lowest, healthCostsRp: h }).totalRp;
    return sorted.every((o) => low <= annualCost({ ...base, ...o, healthCostsRp: h }).totalRp);
  };
  if (!isLowestBest(maxHealthCostsRp)) return null;
  // Monotone au-delà du point de bascule : recherche dichotomique au franc.
  let lo = 0;
  let hi = maxHealthCostsRp;
  if (isLowestBest(lo)) return 0;
  while (hi - lo > 100) {
    const mid = Math.floor((lo + hi) / 200) * 100;
    if (mid <= lo) break;
    if (isLowestBest(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
