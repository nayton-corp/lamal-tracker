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

/*
 * Valeurs de la loi en vigueur (OAMal art. 93 et 103). Elles ne servent que de repli, tant que la
 * table `lamal_parameters` n'a pas de ligne pour l'année : c'est elle qui fait foi, année par année.
 */
export const LEGAL_DEFAULT_FRANCHISES_ADULT = [300, 500, 1000, 1500, 2000, 2500];
export const LEGAL_DEFAULT_FRANCHISES_KID = [0, 100, 200, 300, 400, 500, 600];
/** Quote-part : 10 % des frais au-delà de la franchise. */
export const LEGAL_DEFAULT_COINSURANCE_RATE_BP = 1000;
/** Plafond annuel de la quote-part : CHF 700 (adulte), CHF 350 (enfant). */
export const LEGAL_DEFAULT_COINSURANCE_MAX_ADULT_RP = 70_000;
export const LEGAL_DEFAULT_COINSURANCE_MAX_KID_RP = 35_000;

/**
 * Paramètres de repli d'une année (voir ci-dessus). La redistribution CO2 change chaque année et
 * vient du référentiel officiel (OFEV) : l'appelant la fournit.
 */
export function defaultParameters(year: number, co2AnnualRp: Rappen | null = null): LamalParameters {
  return {
    year,
    franchisesAdult: LEGAL_DEFAULT_FRANCHISES_ADULT,
    franchisesKid: LEGAL_DEFAULT_FRANCHISES_KID,
    coinsuranceRateBp: LEGAL_DEFAULT_COINSURANCE_RATE_BP,
    coinsuranceMaxAdultRp: LEGAL_DEFAULT_COINSURANCE_MAX_ADULT_RP,
    coinsuranceMaxKidRp: LEGAL_DEFAULT_COINSURANCE_MAX_KID_RP,
    co2AnnualRp,
  };
}

export function franchisesFor(params: LamalParameters, ageClass: AgeClass): number[] {
  return ageClass === "KID" ? params.franchisesKid : params.franchisesAdult;
}

export function coinsuranceMaxFor(params: LamalParameters, ageClass: AgeClass): Rappen {
  return ageClass === "KID" ? params.coinsuranceMaxKidRp : params.coinsuranceMaxAdultRp;
}

