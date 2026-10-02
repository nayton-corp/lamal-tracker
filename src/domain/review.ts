import type { Rappen } from "./money";
import { relativeChangeBp } from "./money";

export const REVIEW_STATUSES = ["DRAFT", "DECIDED", "LETTERS_SENT", "CONFIRMED", "CLOSED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  DRAFT: "Comparaison en cours",
  DECIDED: "Décisions prises",
  LETTERS_SENT: "Lettres envoyées",
  CONFIRMED: "Changements confirmés",
  CLOSED: "Clôturé",
};

export const DECISIONS = ["KEEP", "SWITCH", "CHANGE_FRANCHISE", "CHANGE_MODEL"] as const;
export type Decision = (typeof DECISIONS)[number];

export const DECISION_LABEL: Record<Decision, string> = {
  KEEP: "Je reste tel quel",
  SWITCH: "Je change de caisse",
  CHANGE_FRANCHISE: "Je reste, nouvelle franchise",
  CHANGE_MODEL: "Je reste, nouveau modèle",
};

export type DoctorCheck = "YES" | "NO" | "UNKNOWN";

export interface PremiumChange {
  deltaMonthlyRp: Rappen;
  deltaAnnualRp: Rappen;
  /** En points de base ; null si la prime actuelle est inconnue ou nulle. */
  changeBp: number | null;
}

export function premiumChange(currentMonthlyRp: Rappen, renewalMonthlyRp: Rappen): PremiumChange {
  const delta = renewalMonthlyRp - currentMonthlyRp;
  return { deltaMonthlyRp: delta, deltaAnnualRp: delta * 12, changeBp: relativeChangeBp(currentMonthlyRp, renewalMonthlyRp) };
}

/** Données minimales d'une ligne de rituel pour vérifier les invariants. */
export interface ReviewLineState {
  decision: Decision | null;
  chosenTariffId: number | null;
  chosenInsurerId: number | null;
  currentInsurerId: number | null;
  lcaAckAt: string | null;
  /** Nombre de complémentaires LCA actives chez la caisse actuelle. */
  activeLcaCount: number;
  doctorCheck: DoctorCheck;
  requiresDoctorCheck: boolean;
}

export interface Check {
  ok: boolean;
  reasons: string[];
}

/**
 * Invariant central : une lettre de résiliation n'est générée que pour un changement de caisse
 * explicitement choisi et après passage du garde-fou LCA. Vérifié ici et par un trigger SQL.
 */
export function canGenerateTerminationLetter(line: ReviewLineState, hasTerminationAddress: boolean): Check {
  const reasons: string[] = [];
  if (line.decision !== "SWITCH") reasons.push("La décision n'est pas un changement de caisse.");
  if (line.chosenTariffId === null) reasons.push("Aucune nouvelle offre choisie.");
  if (line.chosenInsurerId !== null && line.chosenInsurerId === line.currentInsurerId) {
    reasons.push("La nouvelle offre est chez la même caisse : aucune résiliation nécessaire.");
  }
  if (!line.lcaAckAt) reasons.push("Le garde-fou LCA n'a pas été validé.");
  if (!hasTerminationAddress) reasons.push("L'adresse de résiliation de la caisse actuelle manque.");
  return { ok: reasons.length === 0, reasons };
}

/** Une décision de changement exige une offre d'une autre caisse ; les autres décisions restent chez la même. */
export function validateDecision(
  decision: Decision,
  currentInsurerId: number | null,
  chosen: { insurerId: number; franchiseChf: number; modelType: string } | null,
  current: { franchiseChf: number; modelType: string } | null,
): Check {
  const reasons: string[] = [];
  if (decision === "KEEP") return { ok: true, reasons };
  if (!chosen) return { ok: false, reasons: ["Choisis d'abord une offre."] };
  if (decision === "SWITCH" && chosen.insurerId === currentInsurerId) {
    reasons.push("Cette offre est chez ta caisse actuelle : choisis « nouvelle franchise » ou « nouveau modèle ».");
  }
  if (decision !== "SWITCH" && currentInsurerId !== null && chosen.insurerId !== currentInsurerId) {
    reasons.push("Cette offre est chez une autre caisse : c'est un changement de caisse.");
  }
  if (decision === "CHANGE_FRANCHISE" && current && chosen.franchiseChf === current.franchiseChf) {
    reasons.push("La franchise choisie est identique à l'actuelle.");
  }
  if (decision === "CHANGE_MODEL" && current && chosen.modelType === current.modelType) {
    reasons.push("Le modèle choisi est identique à l'actuel.");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Déduit la décision naturelle d'après l'offre choisie. */
export function inferDecision(
  currentInsurerId: number | null,
  current: { franchiseChf: number; modelType: string; tariffCode: string | null } | null,
  chosen: { insurerId: number; franchiseChf: number; modelType: string; tariffCode: string },
): Decision {
  if (currentInsurerId === null || chosen.insurerId !== currentInsurerId) return "SWITCH";
  if (current && chosen.modelType !== current.modelType) return "CHANGE_MODEL";
  if (current && chosen.franchiseChf !== current.franchiseChf) return "CHANGE_FRANCHISE";
  return "KEEP";
}

export interface ReviewProgressInput {
  lines: readonly {
    decision: Decision | null;
    lcaAckAt: string | null;
    letterSentAt: string | null;
    affiliationConfirmedAt: string | null;
    insurerAckAt: string | null;
  }[];
}

/** Statut du rituel calculé à partir de ses lignes (CLOSED reste un choix explicite). */
export function deriveReviewStatus(input: ReviewProgressInput, closed: boolean): ReviewStatus {
  if (closed) return "CLOSED";
  const { lines } = input;
  if (lines.length === 0 || lines.some((l) => l.decision === null)) return "DRAFT";
  const switching = lines.filter((l) => l.decision === "SWITCH");
  if (switching.length === 0) return "CONFIRMED";
  if (switching.some((l) => !l.letterSentAt)) return "DECIDED";
  if (switching.every((l) => l.affiliationConfirmedAt && l.insurerAckAt)) return "CONFIRMED";
  return "LETTERS_SENT";
}

export type StepState = "done" | "current" | "todo";

export interface RitualStep {
  key: "compare" | "decide" | "lca" | "letters" | "confirm";
  label: string;
  state: StepState;
}

export function ritualSteps(status: ReviewStatus, needsLca: boolean): RitualStep[] {
  const order: ReviewStatus[] = ["DRAFT", "DECIDED", "LETTERS_SENT", "CONFIRMED", "CLOSED"];
  const idx = order.indexOf(status);
  const steps: Omit<RitualStep, "state">[] = [
    { key: "compare", label: "Comparer" },
    { key: "decide", label: "Décider" },
    ...(needsLca ? [{ key: "lca" as const, label: "Garde-fou LCA" }] : []),
    { key: "letters", label: "Lettres" },
    { key: "confirm", label: "Confirmations" },
  ];
  const doneCount = idx === 0 ? 0 : idx === 1 ? (needsLca ? 3 : 2) : idx === 2 ? steps.length - 1 : steps.length;
  return steps.map((s, i) => ({ ...s, state: i < doneCount ? "done" : i === doneCount ? "current" : "todo" }));
}
