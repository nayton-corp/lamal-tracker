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

export interface ModelDetails {
  /** Premier interlocuteur en cas de problème de santé. */
  firstContact: string;
  /** Situations où l'on peut consulter directement. */
  exceptions: string;
  /** Ce qui arrive si on ne respecte pas le parcours. */
  rule: string;
  /** Pour qui le modèle est intéressant. */
  goodFor: string;
}

/** Fonctionnement général des modèles (art. 41 al. 4 et 62 LAMal) ; les conditions exactes sont dans le règlement de la caisse. */
export const MODEL_DETAILS: Record<ModelType, ModelDetails> = {
  STANDARD: {
    firstContact: "Le médecin de votre choix, généraliste ou spécialiste.",
    exceptions: "Aucune démarche préalable.",
    rule: "Aucune règle de parcours.",
    goodFor: "Qui veut aller directement chez un spécialiste ou garder plusieurs médecins.",
  },
  PRAXIS: {
    firstContact: "Votre médecin de famille ou le cabinet de groupe (HMO) choisi dans la liste de la caisse.",
    exceptions: "Urgences, gynécologie et ophtalmologie (contrôles), pédiatrie selon la caisse.",
    rule: "Le spécialiste n'est remboursé que sur délégation du médecin ; sinon, refus de prise en charge ou exclusion du modèle.",
    goodFor: "Qui a déjà un médecin de famille figurant dans la liste de la caisse.",
  },
  TELMED: {
    firstContact: "Un centre de conseil médical par téléphone ou application, avant toute consultation.",
    exceptions: "Urgences, gynécologie et ophtalmologie (contrôles) ; parfois dentiste et pédiatre.",
    rule: "Il faut appeler avant chaque nouveau problème et suivre la recommandation ; sinon, refus de prise en charge.",
    goodFor: "Qui consulte peu et n'est pas attaché à un médecin.",
  },
  PHARMACY: {
    firstContact: "Une pharmacie partenaire, qui conseille, traite les cas simples ou oriente vers un médecin.",
    exceptions: "Urgences, gynécologie et ophtalmologie (contrôles).",
    rule: "Sans passage préalable à la pharmacie, la consultation peut ne pas être remboursée.",
    goodFor: "Qui a une pharmacie partenaire proche et consulte surtout pour des problèmes courants.",
  },
  FLEX: {
    firstContact: "Au choix à chaque fois : médecin de famille, conseil téléphonique ou pharmacie, selon la liste de la caisse.",
    exceptions: "Urgences, gynécologie et ophtalmologie (contrôles).",
    rule: "Il faut passer par l'un des premiers recours proposés ; sinon, refus de prise en charge.",
    goodFor: "Qui veut un rabais sans s'engager sur un seul premier recours.",
  },
  OTHER: {
    firstContact: "Selon le règlement du modèle de la caisse.",
    exceptions: "Urgences au minimum.",
    rule: "Lisez le règlement : les conditions varient d'une caisse à l'autre.",
    goodFor: "À juger d'après les conditions de la caisse.",
  },
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

/**
 * Modèles où l'on choisit son médecin de premier recours dans une liste (médecin de famille, HMO,
 * flexible, autre) : il faut vérifier que le sien y figure. Télémédecine et pharmacie n'en ont pas.
 */
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
export const DEFAULT_KID_SUBGROUP = "K1";

/** Sous-groupe d'âge par défaut de l'OFSP : K1 (enfant), J1 (jeune adulte), E1 (adulte). */
export function defaultSubgroup(ageClass: AgeClass): string {
  return ageClass === "KID" ? DEFAULT_KID_SUBGROUP : ageClass === "YOUNG" ? "J1" : "E1";
}

/** Sous-groupe tarifaire d'une personne : son échelon enfant si elle est enfant, sinon le défaut. */
export function subgroupFor(ageClass: AgeClass, kidSubgroup: string | null | undefined): string {
  return ageClass === "KID" ? kidSubgroup || DEFAULT_KID_SUBGROUP : defaultSubgroup(ageClass);
}

/** Première année de primes publiées par l'OFSP que l'app accepte (saisie, import, rituel). */
export const FIRST_PREMIUM_YEAR = 2010;

/** Années proposées dans les listes : de l'année prochaine à `FIRST_PREMIUM_YEAR`, la plus récente d'abord. */
export function selectableYears(currentYear: number): number[] {
  return Array.from({ length: currentYear + 2 - FIRST_PREMIUM_YEAR }, (_, i) => currentYear + 1 - i);
}

/**
 * Frais de santé annuels supposés tant que le foyer n'a pas répondu au questionnaire
 * des besoins (CHF 500). Ils servent au calcul du coût total d'une franchise.
 */
export const DEFAULT_HEALTH_COSTS_RP = 50_000;
