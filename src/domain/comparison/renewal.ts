import type { AgeClass } from "../age-class";
import type { ModelType } from "../insurance-model";
import { closestAllowedFranchise, type LamalParameters } from "../lamal-parameters";
import type { Rappen } from "../money";
import type { Tariff } from "../tariff";

export type MatchConfidence = "EXACT" | "LINEAGE" | "PROBABLE" | "NONE";

export const MATCH_CONFIDENCE_LABEL: Record<MatchConfidence, string> = {
  EXACT: "Même produit",
  LINEAGE: "Produit renommé (lignée confirmée)",
  PROBABLE: "Correspondance probable, à confirmer",
  NONE: "Introuvable, à choisir",
};

export interface PolicyDescriptor {
  insurerId: number;
  tariffCode: string | null;
  tariffLabel: string | null;
  modelType: ModelType;
  franchiseChf: number;
  accidentIncluded: boolean;
  monthlyPremiumRp: Rappen | null;
}

export interface MatchResult {
  tariff: Tariff | null;
  confidence: MatchConfidence;
  /** Autres tarifs plausibles proposés au choix. */
  candidates: Tariff[];
  /** La franchise a dû changer (passage enfant → jeune adulte). */
  franchiseAdjusted: boolean;
  targetFranchiseChf: number;
}

function normalizeLabel(label: string | null): string {
  return (label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Retrouve le tarif de renouvellement d'un contrat pour l'année suivante, dans les tarifs déjà
 * restreints à la région du foyer. Ne devine jamais en silence : toute correspondance incertaine
 * est marquée PROBABLE ou NONE pour confirmation.
 */
export function findRenewal(
  current: PolicyDescriptor,
  nextYearTariffs: readonly Tariff[],
  params: LamalParameters,
  newAgeClass: AgeClass,
  lineage: ReadonlyMap<string, string>,
  ageSubgroup = "",
): MatchResult {
  const targetFranchiseChf = closestAllowedFranchise(params, newAgeClass, current.franchiseChf);
  const franchiseAdjusted = targetFranchiseChf !== current.franchiseChf;
  const pool = nextYearTariffs.filter(
    (t) =>
      t.insurerId === current.insurerId &&
      t.ageClass === newAgeClass &&
      t.accidentIncluded === current.accidentIncluded &&
      (t.ageSubgroup ?? "") === ageSubgroup,
  );
  const atFranchise = pool.filter((t) => t.franchiseChf === targetFranchiseChf);
  const base = { franchiseAdjusted, targetFranchiseChf };

  if (current.tariffCode) {
    const mapped = lineage.get(`${current.insurerId}:${current.tariffCode}`);
    const code = mapped ?? current.tariffCode;
    const exact = atFranchise.filter((t) => t.tariffCode === code);
    if (exact.length === 1) {
      return { ...base, tariff: exact[0]!, confidence: mapped && mapped !== current.tariffCode ? "LINEAGE" : "EXACT", candidates: [] };
    }
  }

  const sameModel = atFranchise.filter((t) => t.modelType === current.modelType);
  if (sameModel.length === 1) {
    return { ...base, tariff: sameModel[0]!, confidence: "PROBABLE", candidates: [] };
  }
  if (sameModel.length > 1) {
    const label = normalizeLabel(current.tariffLabel);
    const byLabel = label ? sameModel.filter((t) => normalizeLabel(t.tariffLabel) === label) : [];
    if (byLabel.length === 1) {
      return { ...base, tariff: byLabel[0]!, confidence: "PROBABLE", candidates: sameModel.filter((t) => t !== byLabel[0]) };
    }
    return { ...base, tariff: null, confidence: "NONE", candidates: sortByPremium(sameModel) };
  }
  return { ...base, tariff: null, confidence: "NONE", candidates: sortByPremium(atFranchise) };
}

/**
 * Rattache un contrat saisi à la main (caisse, modèle, franchise, prime facturée) à un tarif OFSP
 * de la même année. Le code tarifaire prime ; sinon on retient la prime la plus proche à ±5 %.
 */
export function matchPolicyToTariff(policy: PolicyDescriptor, sameYearTariffs: readonly Tariff[], ageClass: AgeClass, ageSubgroup = ""): MatchResult {
  const pool = sameYearTariffs.filter(
    (t) =>
      t.insurerId === policy.insurerId &&
      t.ageClass === ageClass &&
      t.accidentIncluded === policy.accidentIncluded &&
      t.franchiseChf === policy.franchiseChf &&
      (t.ageSubgroup ?? "") === ageSubgroup,
  );
  const base = { franchiseAdjusted: false, targetFranchiseChf: policy.franchiseChf };
  if (policy.tariffCode) {
    const exact = pool.filter((t) => t.tariffCode === policy.tariffCode);
    if (exact.length === 1) return { ...base, tariff: exact[0]!, confidence: "EXACT", candidates: [] };
  }
  const sameModel = pool.filter((t) => t.modelType === policy.modelType);
  if (sameModel.length === 1 && policy.monthlyPremiumRp === null) {
    return { ...base, tariff: sameModel[0]!, confidence: "PROBABLE", candidates: [] };
  }
  if (policy.monthlyPremiumRp !== null && sameModel.length > 0) {
    const premium = policy.monthlyPremiumRp;
    const sorted = [...sameModel].sort((a, b) => Math.abs(a.monthlyPremiumRp - premium) - Math.abs(b.monthlyPremiumRp - premium));
    const closest = sorted[0]!;
    const within = Math.abs(closest.monthlyPremiumRp - premium) <= Math.round(premium * 0.05);
    if (within) {
      const confidence: MatchConfidence = closest.monthlyPremiumRp === premium && sameModel.length === 1 ? "EXACT" : "PROBABLE";
      return { ...base, tariff: closest, confidence, candidates: sorted.slice(1, 6) };
    }
    return { ...base, tariff: null, confidence: "NONE", candidates: sorted.slice(0, 8) };
  }
  return { ...base, tariff: null, confidence: "NONE", candidates: sortByPremium(sameModel.length > 0 ? sameModel : pool) };
}

function sortByPremium(tariffs: readonly Tariff[]): Tariff[] {
  return [...tariffs].sort((a, b) => a.monthlyPremiumRp - b.monthlyPremiumRp).slice(0, 12);
}
