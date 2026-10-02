import type { RankedOffer } from "./comparison";
import type { Level, TrendLevel } from "./insurer-profile";
import type { ModelType } from "./lamal";
import type { Rappen } from "./money";

/**
 * Les trois stratégies du rituel. Chacune fixe des réglages par défaut (franchise, modèles)
 * que la personne peut ensuite ajuster, et une manière de classer les offres.
 */
export type Strategy = "ECONOMY" | "KEEP" | "BALANCE";

export const STRATEGIES: readonly Strategy[] = ["ECONOMY", "KEEP", "BALANCE"];

export interface StrategyInfo {
  label: string;
  tagline: string;
  /** Ce que l'app fait concrètement. */
  how: string;
  /** Ce qu'on accepte en échange. */
  tradeoff: string;
}

export const STRATEGY_INFO: Record<Strategy, StrategyInfo> = {
  ECONOMY: {
    label: "Économie max",
    tagline: "Le coût annuel le plus bas, quitte à changer de franchise ou de modèle.",
    how: "Toutes les offres, classées par coût réel (prime, franchise et quote-part selon vos frais de santé).",
    tradeoff: "Un modèle avec premier recours (télémédecine, médecin de famille) et parfois une franchise plus élevée.",
  },
  KEEP: {
    label: "Maintien",
    tagline: "Même franchise, même modèle : seulement la caisse la moins chère.",
    how: "Seules les offres avec votre modèle et votre franchise actuels sont comparées. Rien ne change au quotidien, sauf la caisse.",
    tradeoff: "L'économie est souvent plus petite qu'avec un changement de modèle.",
  },
  BALANCE: {
    label: "Équilibre",
    tagline: "Un bon prix chez une caisse solide.",
    how: "Le coût réel, avec un bonus pour les caisses solides (réserves, frais de gestion, hausses passées) et un malus pour les autres.",
    tradeoff: "Parfois un peu plus cher que l'offre la moins chère.",
  },
};

export interface CurrentContract {
  modelType: ModelType;
  franchiseChf: number;
}

/** Réglages proposés d'office pour une stratégie (la personne peut les modifier ensuite). */
export function strategyDefaults(strategy: Strategy, current: CurrentContract): { franchiseChf: number | null; models: ModelType[] | null } {
  switch (strategy) {
    case "KEEP":
      return { franchiseChf: current.franchiseChf, models: [current.modelType] };
    case "ECONOMY":
      return { franchiseChf: null, models: [] };
    case "BALANCE":
      return { franchiseChf: null, models: null };
  }
}

export interface QualitySignals {
  reservesLevel: Level | null;
  adminLevel: Level | null;
  trendLevel: TrendLevel | null;
}

/** Points de solidité d'une caisse, de −3 à +3 (0 si aucune donnée). */
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

/** Bonus ou malus par point de solidité, en pour mille du coût annuel. */
export const QUALITY_WEIGHT_PERMILLE = 30;

/** Coût utilisé pour classer selon l'équilibre : le coût réel, corrigé de la solidité de la caisse. */
export function balanceScoreRp(totalRp: Rappen, points: number): Rappen {
  return Math.round((totalRp * (1000 - QUALITY_WEIGHT_PERMILLE * points)) / 1000);
}

/**
 * Classe des offres (déjà filtrées selon les besoins) pour une stratégie et renumérote.
 * Économie max et maintien : coût réel croissant. Équilibre : coût corrigé de la solidité.
 */
export function rankForStrategy<T extends RankedOffer>(offers: readonly T[], strategy: Strategy, quality: (insurerId: number) => number): T[] {
  const key = (o: T) => (strategy === "BALANCE" ? balanceScoreRp(o.cost.totalRp, quality(o.insurerId)) : o.cost.totalRp);
  return [...offers]
    .sort((a, b) => key(a) - key(b) || a.monthlyPremiumRp - b.monthlyPremiumRp || a.insurerName.localeCompare(b.insurerName, "fr") || a.tariffCode.localeCompare(b.tariffCode))
    .map((o, i) => ({ ...o, rank: i + 1 }));
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

/** Profil le plus proche d'un montant de frais (pour pré-cocher le questionnaire). */
export function usageFor(healthCostsRp: Rappen): UsageProfile | null {
  return USAGE_PROFILES.find((u) => USAGE_INFO[u].healthCostsRp === healthCostsRp) ?? null;
}
