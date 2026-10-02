/** Vocabulaire LAMal partagé par tout le domaine. */

export type AgeClass = "KID" | "YOUNG" | "ADULT";

export const AGE_CLASS_LABEL: Record<AgeClass, string> = {
  KID: "Enfant (0–18)",
  YOUNG: "Jeune adulte (19–25)",
  ADULT: "Adulte (26+)",
};

/**
 * Familles de modèles d'assurance. L'OFSP a changé sa classification en 2027
 * (BASE, PRAXIS, FLEX, TEL_DIG, PHARM) ; les années antérieures (TAR-BASE, TAR-HAM,
 * TAR-HMO, TAR-DIV) sont ramenées sur ces familles pour garder un historique lisible.
 */
export type ModelType = "STANDARD" | "PRAXIS" | "TELMED" | "PHARMACY" | "FLEX" | "OTHER";

export const MODEL_TYPES: readonly ModelType[] = [
  "STANDARD",
  "PRAXIS",
  "TELMED",
  "PHARMACY",
  "FLEX",
  "OTHER",
];

export const MODEL_LABEL: Record<ModelType, string> = {
  STANDARD: "Standard (libre choix)",
  PRAXIS: "Médecin de famille / HMO",
  TELMED: "Télémédecine",
  PHARMACY: "Pharmacie",
  FLEX: "Modèle flexible",
  OTHER: "Autre modèle",
};

/** Ce que le modèle implique au quotidien, en une phrase. */
export const MODEL_HINT: Record<ModelType, string> = {
  STANDARD: "Vous consultez le médecin de votre choix, sans démarche préalable.",
  PRAXIS: "Vous passez d'abord par votre médecin de famille ou un cabinet de groupe (HMO), sauf urgence, gynécologue et ophtalmologue.",
  TELMED: "Vous appelez d'abord un centre de conseil médical par téléphone ou application, qui vous oriente.",
  PHARMACY: "Vous passez d'abord par une pharmacie partenaire, qui vous conseille ou vous oriente.",
  FLEX: "Vous choisissez à chaque fois le premier recours parmi une liste (médecin, téléphone, pharmacie).",
  OTHER: "Modèle propre à la caisse : lisez ses conditions avant de choisir.",
};

/**
 * Libellé lisible d'un tarif. L'OFSP nomme le tarif standard « BASE » (2027) ou
 * « Grundversicherung » (avant) : on affiche « Standard (libre choix) ».
 */
export function displayTariffLabel(label: string | null | undefined, modelType: ModelType): string {
  const l = (label ?? "").trim();
  if (!l || /^(base|grundversicherung|assurance de base|assicurazione di base)$/i.test(l)) {
    return modelType === "STANDARD" ? "Standard (libre choix)" : MODEL_LABEL[modelType];
  }
  return l;
}

/** Un modèle alternatif impose un premier recours : le médecin traitant doit être vérifié. */
export function requiresDoctorCheck(model: ModelType): boolean {
  return model === "PRAXIS" || model === "FLEX" || model === "OTHER";
}

export const CANTONS = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE",
  "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH",
] as const;
export type Canton = (typeof CANTONS)[number];

export function isCanton(value: string): value is Canton {
  return (CANTONS as readonly string[]).includes(value);
}

/** Échelon de rabais enfant (K1 = tarif normal). Non documenté par l'OFSP, lu sur la police. */
export const KID_SUBGROUPS = ["K1", "K3", "K4", "K5"] as const;

export function defaultSubgroup(ageClass: AgeClass): string {
  return ageClass === "KID" ? "K1" : ageClass === "YOUNG" ? "J1" : "E1";
}
