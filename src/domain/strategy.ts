import type { TercileLevel, TrendLevel } from "./insurer-profile";
import type { ModelType } from "./lamal";
import type { Rappen } from "./money";

/**
 * Ce qui compte le plus pour le foyer, première question des préférences du rituel. Chaque choix
 * pré-remplit les filtres de chaque personne (franchise, modèles), qu'elle peut ensuite affiner.
 * Les offres sont toujours classées par coût réel de l'année.
 */
export type Strategy = "ECONOMY" | "KEEP";

export const STRATEGIES: readonly Strategy[] = ["ECONOMY", "KEEP"];

export interface StrategyInfo {
  label: string;
  tagline: string;
}

export const STRATEGY_INFO: Record<Strategy, StrategyInfo> = {
  ECONOMY: {
    label: "Payer le moins possible",
    tagline: "Tous les modèles, et la franchise la moins chère sur l'année pour vos frais.",
  },
  KEEP: {
    label: "Ne rien changer au quotidien",
    tagline: "Même modèle et même franchise : seule la caisse change.",
  },
};

export interface StrategyBaseline {
  modelType: ModelType;
  franchiseChf: number;
}

/**
 * Réglages proposés d'office pour un choix (la personne peut les affiner ensuite).
 * `franchiseChf` null = l'app choisit la franchise la plus avantageuse ; `models` [] = tous.
 */
export function strategyDefaults(strategy: Strategy, current: StrategyBaseline): { franchiseChf: number | null; models: ModelType[] } {
  return strategy === "KEEP" ? { franchiseChf: current.franchiseChf, models: [current.modelType] } : { franchiseChf: null, models: [] };
}

export interface QualitySignals {
  reservesLevel: TercileLevel | null;
  adminLevel: TercileLevel | null;
  trendLevel: TrendLevel | null;
}

/** Points de solidité d'une caisse, de −3 à +3 (0 si aucune donnée) : badge « Caisse solide ». */
export function qualityPoints(q: QualitySignals | null): number {
  if (!q) return 0;
  let points = 0;
  if (q.reservesLevel === "HIGH") points++;
  if (q.reservesLevel === "LOW") points--;
  if (q.adminLevel === "LOW") points++;
  if (q.adminLevel === "HIGH") points--;
  if (q.trendLevel === "BETTER") points++;
  if (q.trendLevel === "WORSE") points--;
  return points;
}

/** Profils de consommation en langage courant, convertis en frais de santé annuels. */
export type UsageProfile = "RARE" | "FEW" | "REGULAR" | "HEAVY";

export const USAGE_PROFILES: readonly UsageProfile[] = ["RARE", "FEW", "REGULAR", "HEAVY"];

export const USAGE_INFO: Record<UsageProfile, { label: string; example: string; healthCostsRp: Rappen }> = {
  RARE: { label: "Presque jamais malade", example: "Une consultation par an, au plus.", healthCostsRp: 30_000 },
  FEW: { label: "Quelques consultations", example: "Deux à cinq visites, quelques médicaments.", healthCostsRp: 120_000 },
  REGULAR: { label: "Suivi régulier", example: "Traitement suivi, physiothérapie, examens.", healthCostsRp: 350_000 },
  HEAVY: { label: "Traitement lourd", example: "Opération prévue, maladie chronique, grossesse.", healthCostsRp: 1_000_000 },
};

/** Profil dont le montant de frais est exactement celui-ci (pour pré-cocher le questionnaire) ; null sinon. */
export function usageFor(healthCostsRp: Rappen): UsageProfile | null {
  return USAGE_PROFILES.find((u) => USAGE_INFO[u].healthCostsRp === healthCostsRp) ?? null;
}
