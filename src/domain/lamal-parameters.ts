import type { AgeClass } from "./age-class";
import type { Rappen } from "./money";

/**
 * Paramètres légaux LAMal d'une année. Jamais codés en dur dans les calculs :
 * ils sont stockés par année et modifiables, ces valeurs ne servent que de point de départ.
 */
export interface LamalParameters {
  year: number;
  /** Franchises autorisées (CHF) pour adultes et jeunes adultes. */
  franchisesAdult: number[];
  /** Franchises autorisées (CHF) pour enfants. */
  franchisesKid: number[];
  /** Taux de quote-part en points de base (10 % = 1000). */
  coinsuranceRateBp: number;
  coinsuranceMaxAdultRp: Rappen;
  coinsuranceMaxKidRp: Rappen;
}

/** Valeurs en vigueur depuis 2005 / 2004 (OAMal art. 93, 94, 103). */
export function defaultLamalParameters(year: number): LamalParameters {
  return {
    year,
    franchisesAdult: [300, 500, 1000, 1500, 2000, 2500],
    franchisesKid: [0, 100, 200, 300, 400, 500, 600],
    coinsuranceRateBp: 1000,
    coinsuranceMaxAdultRp: 70_000,
    coinsuranceMaxKidRp: 35_000,
  };
}

export function allowedFranchises(params: LamalParameters, ageClass: AgeClass): number[] {
  return [...(ageClass === "KID" ? params.franchisesKid : params.franchisesAdult)].sort((a, b) => a - b);
}

export function minimumFranchise(params: LamalParameters, ageClass: AgeClass): number {
  const list = allowedFranchises(params, ageClass);
  const first = list[0];
  if (first === undefined) throw new Error(`Aucune franchise définie pour ${params.year}.`);
  return first;
}

export function coinsuranceMax(params: LamalParameters, ageClass: AgeClass): Rappen {
  return ageClass === "KID" ? params.coinsuranceMaxKidRp : params.coinsuranceMaxAdultRp;
}

/**
 * Franchise la plus proche autorisée dans la nouvelle classe d'âge
 * (un enfant à 600 qui devient jeune adulte passe à 500, la valeur adulte la plus proche).
 */
export function closestAllowedFranchise(params: LamalParameters, ageClass: AgeClass, franchiseChf: number): number {
  const list = allowedFranchises(params, ageClass);
  if (list.includes(franchiseChf)) return franchiseChf;
  let best = list[0] ?? franchiseChf;
  for (const f of list) {
    if (Math.abs(f - franchiseChf) < Math.abs(best - franchiseChf)) best = f;
  }
  return best;
}

export function validateLamalParameters(params: LamalParameters): string[] {
  const errors: string[] = [];
  if (params.franchisesAdult.length === 0) errors.push("Au moins une franchise adulte est requise.");
  if (params.franchisesKid.length === 0) errors.push("Au moins une franchise enfant est requise.");
  for (const f of [...params.franchisesAdult, ...params.franchisesKid]) {
    if (!Number.isInteger(f) || f < 0) errors.push(`Franchise invalide : ${f}`);
  }
  if (params.coinsuranceRateBp < 0 || params.coinsuranceRateBp > 10_000) errors.push("Taux de quote-part invalide.");
  if (params.coinsuranceMaxAdultRp < 0 || params.coinsuranceMaxKidRp < 0) errors.push("Plafond de quote-part invalide.");
  return errors;
}
