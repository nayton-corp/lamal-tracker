import type { IsoDate } from "./dates";

export type ReviewStatus = "OPEN" | "DECIDED" | "LETTERS_SENT" | "CLOSED";
export type Decision = "UNDECIDED" | "KEEP" | "SWITCH" | "ADJUST";

export const DECISION_LABEL: Record<Decision, string> = {
  UNDECIDED: "À décider",
  KEEP: "Je garde",
  SWITCH: "Je change de caisse",
  ADJUST: "Je change de franchise ou de modèle",
};

export interface LineForLetter {
  decision: Decision;
  currentInsurerId: number;
  chosenInsurerId: number | null;
  lcaAckAt: string | null;
  insurerHasAddress: boolean;
  policyNumber: string | null;
  affiliationRequestedAt: IsoDate | null;
}

export interface LetterCheck {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
}

/**
 * Garde-fous avant de générer une lettre. Une résiliation LAMal ne sort jamais sans
 * que l'utilisateur ait explicitement confirmé que ses complémentaires LCA restent actives.
 */
export function checkLetter(line: LineForLetter): LetterCheck {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (line.decision === "SWITCH") {
    if (line.chosenInsurerId === null) blockers.push("Aucune nouvelle caisse choisie.");
    else if (line.chosenInsurerId === line.currentInsurerId)
      blockers.push("La caisse choisie est la caisse actuelle : ce n'est pas un changement de caisse.");
    if (!line.lcaAckAt) blockers.push("Confirmation LCA manquante : passez l'étape « Complémentaires LCA ».");
    if (!line.affiliationRequestedAt)
      warnings.push(
        "Demandez d'abord l'affiliation à la nouvelle caisse : l'ancienne ne vous libère qu'à réception de sa confirmation.",
      );
  } else if (line.decision === "ADJUST") {
    if (line.chosenInsurerId !== null && line.chosenInsurerId !== line.currentInsurerId)
      blockers.push("Un changement de franchise ou de modèle se fait chez la caisse actuelle.");
  } else {
    blockers.push("Aucune lettre nécessaire pour cette décision.");
  }

  if (!line.insurerHasAddress) blockers.push("Adresse de la caisse actuelle manquante (Réglages › Caisses).");
  if (!line.policyNumber) warnings.push("Numéro d'assuré manquant : la caisse le demandera probablement.");

  return { allowed: blockers.length === 0, blockers, warnings };
}

export interface LcaContract {
  productName: string;
  insurerName: string;
  /** Caisse LAMal du même groupe, si connue. */
  linkedInsurerId: number | null;
}

export interface LcaWarning {
  level: "danger" | "info";
  text: string;
}

/** Messages du garde-fou LCA pour une personne qui quitte sa caisse LAMal. */
export function lcaWarnings(
  contracts: readonly LcaContract[],
  currentInsurerId: number,
  currentInsurerName: string,
): LcaWarning[] {
  const sameGroup = contracts.filter((c) => c.linkedInsurerId === currentInsurerId);
  const out: LcaWarning[] = [];
  if (sameGroup.length > 0) {
    out.push({
      level: "danger",
      text: `${sameGroup.length === 1 ? "Une complémentaire" : `${sameGroup.length} complémentaires`} LCA chez le groupe ${currentInsurerName} (${sameGroup
        .map((c) => c.productName)
        .join(", ")}) : la lettre ne résilie que la LAMal, ces contrats restent actifs et facturés.`,
    });
    out.push({
      level: "info",
      text: "Un rabais de « paquet » LAMal + LCA peut disparaître : la prime LCA peut augmenter l'an prochain.",
    });
  } else if (contracts.length === 0) {
    out.push({
      level: "info",
      text: `Aucune complémentaire LCA enregistrée. Vérifiez votre police : si vous en avez une chez ${currentInsurerName}, elle n'est pas résiliée par cette lettre.`,
    });
  }
  out.push({
    level: "danger",
    text: "Ne résiliez jamais une LCA avant d'avoir l'acceptation écrite d'une nouvelle : la LCA peut vous refuser selon votre état de santé.",
  });
  return out;
}
