import type { AgeClass } from "./lamal";
import type { Rappen } from "./money";

/** Paramètres légaux d'une année. Jamais en dur dans le code métier : ils voyagent avec l'année. */
export interface LamalParameters {
  year: number;
  franchisesAdult: number[];
  franchisesKid: number[];
  /** Quote-part en points de base (1000 = 10 %). */
  coinsuranceRateBp: number;
  coinsuranceMaxAdultRp: Rappen;
  coinsuranceMaxKidRp: Rappen;
  /** Redistribution CO2/COV annuelle par personne ; null tant qu'elle n'est pas connue. */
  co2AnnualRp: Rappen | null;
}

/**
 * Paramètres légaux par défaut d'une année. La redistribution CO2 vient du référentiel officiel
 * (OFEV), fourni par l'appelant : le domaine ne connaît aucun montant en dur.
 */
export function defaultParameters(year: number, co2AnnualRp: Rappen | null = null): LamalParameters {
  return {
    year,
    franchisesAdult: [300, 500, 1000, 1500, 2000, 2500],
    franchisesKid: [0, 100, 200, 300, 400, 500, 600],
    coinsuranceRateBp: 1000,
    coinsuranceMaxAdultRp: 70000,
    coinsuranceMaxKidRp: 35000,
    co2AnnualRp,
  };
}

export function franchisesFor(params: LamalParameters, ageClass: AgeClass): number[] {
  return ageClass === "KID" ? params.franchisesKid : params.franchisesAdult;
}

export function coinsuranceMaxFor(params: LamalParameters, ageClass: AgeClass): Rappen {
  return ageClass === "KID" ? params.coinsuranceMaxKidRp : params.coinsuranceMaxAdultRp;
}

