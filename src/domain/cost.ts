import type { Rappen } from "./money";

/*
 * Coût annuel attendu d'une assurance de base : prime, franchise et quote-part, en centimes.
 * Sert au classement des offres, au simulateur de franchise et aux stratégies du bilan.
 */

export interface CostInput {
  monthlyPremiumRp: Rappen;
  franchiseChf: number;
  /** Frais de santé annuels attendus (factures avant participation). */
  healthCostsRp: Rappen;
  /** Taux de quote-part en points de base (1000 = 10 %). */
  coinsuranceRateBp: number;
  coinsuranceMaxRp: Rappen;
  /** Redistribution CO2 annuelle, déduite de la prime ; null = inconnue (comptée 0). */
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

export interface CostScenarios {
  /** Aucune facture de santé : prime nette seulement. */
  noCostsRp: Rappen;
  /** Frais attendus de la personne. */
  expectedRp: Rappen;
  /** Année chargée : franchise et quote-part maximale épuisées. */
  worstRp: Rappen;
}

/** Trois années types pour comparer les offres sur leur risque, pas seulement sur la moyenne. */
export function costScenarios(input: CostInput): CostScenarios {
  const expected = annualCost(input).totalRp;
  const none = annualCost({ ...input, healthCostsRp: 0 }).totalRp;
  const worst = annualCost(input).netPremiumRp + input.franchiseChf * 100 + input.coinsuranceMaxRp;
  return { noCostsRp: none, expectedRp: expected, worstRp: worst };
}
