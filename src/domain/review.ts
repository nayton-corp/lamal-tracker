import type { IsoDate } from "./dates";

/** Garde-fous des courriers (checkLetter) et vocabulaire des décisions du bilan. */

/** Seuls OPEN et CLOSED sont écrits ; DECIDED et LETTERS_SENT sont des valeurs historiques du schéma. */
export type ReviewStatus = "OPEN" | "DECIDED" | "LETTERS_SENT" | "CLOSED";
/** Décision pour une personne : à décider, garder, changer de caisse, changer de franchise ou de modèle. */
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
  insurerHasAddress: boolean;
  /** Numéro à rappeler dans la lettre (n° d'assuré, sinon AVS, sinon n° de police). */
  policyNumber: string | null;
  affiliationRequestedAt: IsoDate | null;
}

/** Avertissements possibles avant une lettre (codes stables, pour filtrer sans lire le texte). */
export type LetterWarningCode = "AFFILIATION_FIRST" | "INSURED_NUMBER_MISSING";

export interface LetterWarning {
  code: LetterWarningCode;
  text: string;
}

export interface LetterCheck {
  /** Aucune raison bloquante : la lettre peut être préparée. */
  allowed: boolean;
  /** Raisons qui empêchent de préparer la lettre (texte affiché tel quel). */
  blockers: string[];
  /** Points à vérifier, qui n'empêchent rien. */
  warnings: LetterWarning[];
}

/**
 * Garde-fous avant de générer une lettre. La résiliation ne vise que l'assurance de base : les
 * complémentaires LCA restent actives (la lettre le dit, l'écran d'envoi le rappelle).
 */
export function checkLetter(line: LineForLetter): LetterCheck {
  const blockers: string[] = [];
  const warnings: LetterWarning[] = [];

  if (line.decision === "SWITCH") {
    if (line.chosenInsurerId === null) blockers.push("Aucune nouvelle caisse choisie.");
    else if (line.chosenInsurerId === line.currentInsurerId)
      blockers.push("La caisse choisie est la caisse actuelle : ce n'est pas un changement de caisse.");
    if (!line.affiliationRequestedAt)
      warnings.push({
        code: "AFFILIATION_FIRST",
        text: "Demandez d'abord l'affiliation à la nouvelle caisse : l'ancienne ne vous libère qu'à réception de sa confirmation.",
      });
  } else if (line.decision === "ADJUST") {
    if (line.chosenInsurerId !== null && line.chosenInsurerId !== line.currentInsurerId)
      blockers.push("Un changement de franchise ou de modèle se fait chez la caisse actuelle.");
  } else {
    blockers.push("Aucune lettre nécessaire pour cette décision.");
  }

  if (!line.insurerHasAddress) blockers.push("Adresse de la caisse actuelle manquante (Réglages › Caisses).");
  if (!line.policyNumber) warnings.push({ code: "INSURED_NUMBER_MISSING", text: "Numéro d'assuré manquant : la caisse le demandera probablement." });

  return { allowed: blockers.length === 0, blockers, warnings };
}
