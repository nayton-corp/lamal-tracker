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

/** Montants publiés par la Confédération (redistribution des taxes environnementales). */
const KNOWN_CO2: Record<number, Rappen> = {
  2026: 6180,
  2027: 5700,
};

export function defaultParameters(year: number): LamalParameters {
  return {
    year,
    franchisesAdult: [300, 500, 1000, 1500, 2000, 2500],
    franchisesKid: [0, 100, 200, 300, 400, 500, 600],
    coinsuranceRateBp: 1000,
    coinsuranceMaxAdultRp: 70000,
    coinsuranceMaxKidRp: 35000,
    co2AnnualRp: KNOWN_CO2[year] ?? null,
  };
}

export function franchisesFor(params: LamalParameters, ageClass: AgeClass): number[] {
  return ageClass === "KID" ? params.franchisesKid : params.franchisesAdult;
}

export function coinsuranceMaxFor(params: LamalParameters, ageClass: AgeClass): Rappen {
  return ageClass === "KID" ? params.coinsuranceMaxKidRp : params.coinsuranceMaxAdultRp;
}

/** Part mensuelle de la redistribution CO2, arrondie au centime. */
export function co2MonthlyRp(params: LamalParameters): Rappen {
  return params.co2AnnualRp === null ? 0 : Math.round(params.co2AnnualRp / 12);
}
