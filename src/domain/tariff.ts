import type { AgeClass } from "./age-class";
import type { ModelType } from "./insurance-model";
import type { Rappen } from "./money";

/** Une ligne de tarif OFSP normalisée : prime mensuelle d'un produit pour un profil. */
export interface Tariff {
  id: number;
  datasetId: number;
  year: number;
  insurerId: number;
  insurerName: string;
  canton: string;
  region: number;
  ageClass: AgeClass;
  /** Sous-groupe d'âge (ex. rabais 2e/3e enfant), vide pour le tarif principal. */
  ageSubgroup: string;
  accidentIncluded: boolean;
  modelType: ModelType;
  tariffCode: string;
  tariffLabel: string;
  franchiseChf: number;
  monthlyPremiumRp: Rappen;
}

/** Identité d'un produit indépendamment de la franchise. */
export function productKey(t: Pick<Tariff, "insurerId" | "tariffCode">): string {
  return `${t.insurerId}:${t.tariffCode}`;
}

export const CANTONS = [
  "AG",
  "AI",
  "AR",
  "BE",
  "BL",
  "BS",
  "FR",
  "GE",
  "GL",
  "GR",
  "JU",
  "LU",
  "NE",
  "NW",
  "OW",
  "SG",
  "SH",
  "SO",
  "SZ",
  "TG",
  "TI",
  "UR",
  "VD",
  "VS",
  "ZG",
  "ZH",
] as const;
export type Canton = (typeof CANTONS)[number];

export function isCanton(value: string): value is Canton {
  return (CANTONS as readonly string[]).includes(value);
}
