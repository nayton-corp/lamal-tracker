import type { Offer } from "./comparison";
import type { ModelType } from "./lamal";

export interface CurrentContract {
  insurerId: number;
  tariffCode: string | null;
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

/**
 * Retrouve le tarif de renouvellement chez l'assureur actuel dans le jeu de l'année cible.
 * Les codes tarifaires changent parfois : une correspondance confirmée par l'utilisateur
 * (lignée) prime, sinon on cherche par code, puis par famille de modèle.
 *
 * `candidates` : offres de l'assureur actuel déjà filtrées sur canton, région,
 * classe d'âge cible, couverture accident et sous-groupe.
 */
export function findRenewal(
  contract: CurrentContract,
  candidates: readonly Offer[],
  allowedFranchises: readonly number[],
  confirmedCode: string | null = null,
): RenewalResult {
  const franchiseChf = nearestFranchise(contract.franchiseChf, allowedFranchises);
  const franchiseAdjusted = franchiseChf !== contract.franchiseChf;
  const own = candidates.filter(
    (c) => c.insurerId === contract.insurerId && c.franchiseChf === franchiseChf,
  );
  const code = confirmedCode ?? contract.tariffCode;

  if (code) {
    const exact = own.find((c) => c.tariffCode === code);
    if (exact) return { status: "MATCHED", offer: exact, franchiseChf, franchiseAdjusted, alternatives: [] };
  }

  const sameModel = own.filter((c) => c.modelType === contract.modelType);
  const byCode = new Map(sameModel.map((c) => [c.tariffCode, c]));
  if (byCode.size === 1) {
    return {
      status: "PROBABLE",
      offer: [...byCode.values()][0]!,
      franchiseChf,
      franchiseAdjusted,
      alternatives: [],
    };
  }
  const pool = byCode.size > 1 ? [...byCode.values()] : own;
  return {
    status: pool.length > 0 ? "AMBIGUOUS" : "MISSING",
    offer: null,
    franchiseChf,
    franchiseAdjusted,
    alternatives: [...pool].sort((a, b) => a.monthlyPremiumRp - b.monthlyPremiumRp),
  };
}
