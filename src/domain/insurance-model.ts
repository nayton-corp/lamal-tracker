export const MODEL_TYPES = ["STANDARD", "FAMILY_DOCTOR", "HMO", "TELMED", "PHARMACY", "OTHER"] as const;
export type ModelType = (typeof MODEL_TYPES)[number];

export const MODEL_LABEL: Record<ModelType, string> = {
  STANDARD: "Standard (libre choix)",
  FAMILY_DOCTOR: "Médecin de famille",
  HMO: "HMO / centre de santé",
  TELMED: "Télémédecine",
  PHARMACY: "Pharmacie",
  OTHER: "Autre modèle",
};

export const MODEL_SHORT: Record<ModelType, string> = {
  STANDARD: "Standard",
  FAMILY_DOCTOR: "Médecin de famille",
  HMO: "HMO",
  TELMED: "Telmed",
  PHARMACY: "Pharmacie",
  OTHER: "Autre",
};

/** Les modèles qui imposent un premier recours : le médecin traitant doit être vérifié. */
export function requiresDoctorCheck(model: ModelType): boolean {
  return model === "FAMILY_DOCTOR" || model === "HMO";
}

const TELMED_RE =
  /tel[\s-]?med|t[ée]l[ée]m[ée]d|call[\s-]?med|med[\s-]?call|tel[\s-]?first|tel[\s-]?care|tel[\s-]?doc|sanatel|premed|medgate|medi24|telefon|t[ée]l[ée]phon|sant[ée][\s-]?24/i;
const PHARMACY_RE = /apothek|pharmac/i;
const HMO_RE = /\bhmo\b|gesundheitszentrum|centre de sant[ée]|sanacare|[äa]rztenetz|praxisnetz|r[ée]seau de soins/i;
const FAMILY_RE = /haus[\s-]?arzt|m[ée]decin de famille|family doctor|premier recours|m[ée]decin traitant/i;

/**
 * Classe un tarif OFSP. L'OFSP ne distingue que base / médecin de famille / HMO / divers (« TAR-DIV ») ;
 * les modèles « divers » sont reclassés par une règle sur le libellé, corrigeable à la main.
 */
export function classifyModel(tariffTypeRaw: string, label: string): ModelType {
  const type = tariffTypeRaw.trim().toUpperCase();
  if (/BASE|STANDARD|ORDINAIRE/.test(type)) return "STANDARD";
  if (/HAM|HAUSARZT|FAMILLE|FAMILY/.test(type)) return "FAMILY_DOCTOR";
  if (/HMO/.test(type)) return "HMO";
  // Divers ou inconnu : on regarde le libellé.
  if (TELMED_RE.test(label)) return "TELMED";
  if (PHARMACY_RE.test(label)) return "PHARMACY";
  if (HMO_RE.test(label)) return "HMO";
  if (FAMILY_RE.test(label)) return "FAMILY_DOCTOR";
  return "OTHER";
}
