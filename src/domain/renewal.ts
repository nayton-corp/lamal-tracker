import type { Offer } from "./comparison";
import type { ModelType } from "./lamal";

export interface CurrentContract {
  insurerId: number;
  tariffCode: string | null;
  tariffLabel?: string | null;
  modelType: ModelType;
  franchiseChf: number;
}

export type RenewalStatus = "MATCHED" | "PROBABLE" | "AMBIGUOUS" | "MISSING";

export interface RenewalResult {
  status: RenewalStatus;
  offer: Offer | null;
  /** Franchise retenue pour l'année cible (peut différer en cas de changement de classe d'âge). */
  franchiseChf: number;
  franchiseAdjusted: boolean;
  /** Tarifs candidats quand la correspondance n'est pas certaine. */
  alternatives: Offer[];
}

export function nearestFranchise(current: number, allowed: readonly number[]): number {
  if (allowed.includes(current)) return current;
  return [...allowed].sort((a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b)[0] ?? current;
}

/** « Bestcare (BESTCARE) » → « bestcare bestcare » ; accents, casse et ponctuation ignorés. */
export function normalizeTariff(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsPhrase(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}

function tokens(s: string | null | undefined): string[] {
  return [...new Set(normalizeTariff(s).split(" ").filter(Boolean))];
}

/**
 * Proximité de libellés pondérée : un mot commun à toutes les offres de la caisse
 * (« Helsana », « BeneFit », « PLUS ») ne distingue rien ; un suffixe de région ou un numéro
 * (« R3 », « 2 ») compte peu. Le nom commercial (« Flexmed ») fait la différence.
 */
export function labelScores(label: string | null | undefined, candidates: readonly { tariffLabel: string }[]): number[] {
  const own = tokens(label);
  const sets = candidates.map((c) => new Set(tokens(c.tariffLabel)));
  const weight = (t: string) => {
    const freq = sets.filter((set) => set.has(t)).length / Math.max(sets.length, 1);
    const base = sets.length > 1 ? 1 - freq : 1;
    return /^(r?\d+)$/.test(t) ? base * 0.3 : base;
  };
  const total = own.reduce((sum, t) => sum + weight(t), 0);
  if (total === 0) return sets.map(() => 0);
  return sets.map((set) => own.filter((t) => set.has(t)).reduce((sum, t) => sum + weight(t), 0) / total);
}

function uniqueByCode(offers: readonly Offer[]): Offer[] {
  return [...new Map(offers.map((o) => [o.tariffCode, o])).values()];
}

/**
 * Retrouve le tarif de renouvellement chez l'assureur actuel dans le jeu de l'année cible,
 * sans rien demander dans les cas usuels. Observé sur les vraies données 2026→2027 : 85 % des
 * codes sont identiques ; les autres changent de casse (« TelMed » → « Telmed »), gagnent un
 * libellé (« BESTCARE » → « Bestcare (BESTCARE) », « Hausarztmodell 1 » →
 * « Hausarztmodell 1 (NetMed 1) ») ou gardent leur nom commercial (« Flexmed »).
 *
 * Ordre : correspondance confirmée par l'utilisateur, code identique (casse et ponctuation
 * ignorées), ancien code contenu dans le nouveau, libellé le plus proche, modèle unique.
 * `candidates` : offres déjà filtrées sur canton, région, classe d'âge cible, accident, sous-groupe.
 */
export function findRenewal(
  contract: CurrentContract,
  candidates: readonly Offer[],
  allowedFranchises: readonly number[],
  confirmedCode: string | null = null,
): RenewalResult {
  const franchiseChf = nearestFranchise(contract.franchiseChf, allowedFranchises);
  const franchiseAdjusted = franchiseChf !== contract.franchiseChf;
  const own = uniqueByCode(candidates.filter((c) => c.insurerId === contract.insurerId && c.franchiseChf === franchiseChf));
  const result = (status: RenewalStatus, offer: Offer | null, alternatives: Offer[] = []): RenewalResult => ({
    status,
    offer,
    franchiseChf,
    franchiseAdjusted,
    alternatives: [...alternatives].sort((a, b) => a.monthlyPremiumRp - b.monthlyPremiumRp),
  });
  if (own.length === 0) return result("MISSING", null);

  if (confirmedCode) {
    const confirmed = own.find((c) => c.tariffCode === confirmedCode);
    if (confirmed) return result("MATCHED", confirmed);
  }

  const code = normalizeTariff(contract.tariffCode);
  if (code) {
    const exact = own.filter((c) => normalizeTariff(c.tariffCode) === code);
    if (exact.length === 1) return result("MATCHED", exact[0]!);
    const containing = own.filter(
      (c) => containsPhrase(normalizeTariff(c.tariffCode), code) || containsPhrase(normalizeTariff(c.tariffLabel), code),
    );
    if (containing.length === 1) return result("MATCHED", containing[0]!);
  }

  if (contract.tariffLabel) {
    const scores = labelScores(contract.tariffLabel, own);
    const ranked = own.map((c, i) => ({ c, score: scores[i]! })).sort((a, b) => b.score - a.score);
    const [best, second] = ranked;
    if (best && best.score >= 0.5 && (!second || best.score - second.score >= 0.15)) return result("PROBABLE", best.c);
  }

  const sameModel = own.filter((c) => c.modelType === contract.modelType);
  if (sameModel.length === 1) return result("PROBABLE", sameModel[0]!);
  return result("AMBIGUOUS", null, sameModel.length > 1 ? sameModel : own);
}
