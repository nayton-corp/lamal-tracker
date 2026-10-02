import { eq } from "drizzle-orm";
import {
  cheapestPerFranchise,
  costOf,
  filterOffers,
  marketStats,
  rankOffers,
  type RankedOffer,
  type SortKey,
} from "@/domain/comparison";
import { breakEvenRp, franchiseCurve, type CurvePoint } from "@/domain/cost";
import type { ModelType } from "@/domain/lamal";
import { coinsuranceMaxFor, franchisesFor } from "@/domain/parameters";
import type { Db } from "@/infrastructure/db/client";
import { offersFor, parametersFor } from "@/infrastructure/db/queries";
import { lamalPolicy, person, review, reviewLine } from "@/infrastructure/db/schema";
import { getHousehold } from "./household";
import { UserError } from "./review";

export interface CompareOptions {
  models?: ModelType[];
  franchises?: number[];
  healthCostsRp?: number;
  sort?: SortKey;
  /** Ignore les exclusions et modèles préférés de la personne. */
  all?: boolean;
}

export interface CompareView {
  lineId: number;
  targetYear: number;
  personName: string;
  allowedFranchises: number[];
  healthCostsRp: number;
  offers: RankedOffer[];
  totalOffers: number;
  renewal: { monthlyRp: number; totalRp: number; label: string | null; franchiseChf: number } | null;
  chosen: { tariffCode: string | null; franchiseChf: number | null; insurerId: number | null };
  currentInsurerId: number;
  curve: { franchises: number[]; points: CurvePoint[]; breakEvenRp: number | null };
  /** Tarifs de l'assureur actuel (franchise de renouvellement), pour confirmer un renouvellement incertain. */
  renewalCandidates: { code: string; label: string; modelType: ModelType; monthlyRp: number }[];
  renewalStatus: string;
  market: ReturnType<typeof marketStats>;
}

export function compareForLine(db: Db, lineId: number, opts: CompareOptions = {}): CompareView {
  const line = db.select().from(reviewLine).where(eq(reviewLine.id, lineId)).get();
  if (!line) throw new UserError("Ligne introuvable.");
  const r = db.select().from(review).where(eq(review.id, line.reviewId)).get()!;
  const p = db.select().from(person).where(eq(person.id, line.personId)).get()!;
  const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const h = getHousehold(db)!;
  const params = parametersFor(db, r.targetYear);
  const allowedFranchises = franchisesFor(params, line.targetAgeClass);
  const healthCostsRp = opts.healthCostsRp ?? p.healthCostsRp;
  const ctx = { ageClass: line.targetAgeClass, params, healthCostsRp };

  const all = offersFor(db, {
    datasetId: r.datasetId,
    canton: h.canton,
    region: h.region,
    ageClass: line.targetAgeClass,
    accident: line.accident,
    subgroup: line.subgroup,
  }).filter((o) => allowedFranchises.includes(o.franchiseChf));

  const renewal =
    line.renewalMonthlyRp === null
      ? null
      : {
          monthlyRp: line.renewalMonthlyRp,
          totalRp: costOf({ monthlyPremiumRp: line.renewalMonthlyRp, franchiseChf: line.renewalFranchiseChf }, ctx).totalRp,
          label: line.renewalLabel,
          franchiseChf: line.renewalFranchiseChf,
        };

  const filtered = filterOffers(all, {
    models: opts.models?.length ? opts.models : opts.all ? [] : (p.allowedModels as ModelType[]),
    franchises: opts.franchises,
    excludedInsurerIds: opts.all ? [] : p.excludedInsurerIds,
  });
  const ranked = rankOffers(filtered, { ...ctx, referenceTotalRp: renewal?.totalRp ?? null }, opts.sort ?? "total");

  const cheapest = cheapestPerFranchise(filterOffers(all, { models: opts.models }));
  const base = {
    coinsuranceRateBp: params.coinsuranceRateBp,
    coinsuranceMaxRp: coinsuranceMaxFor(params, line.targetAgeClass),
    co2AnnualRp: params.co2AnnualRp,
  };
  const maxH = line.targetAgeClass === "KID" ? 400_000 : 1_000_000;
  return {
    lineId,
    targetYear: r.targetYear,
    personName: `${p.firstName} ${p.lastName}`,
    allowedFranchises,
    healthCostsRp,
    offers: ranked,
    totalOffers: all.length,
    renewal,
    chosen: { tariffCode: line.chosenTariffCode, franchiseChf: line.chosenFranchiseChf, insurerId: line.chosenInsurerId },
    currentInsurerId: policy.insurerId,
    curve: {
      franchises: cheapest.map((o) => o.franchiseChf),
      points: franchiseCurve(cheapest, base, maxH, maxH / 40),
      breakEvenRp: breakEvenRp(cheapest, base, maxH * 2),
    },
    renewalCandidates: [...new Map(
      all
        .filter((o) => o.insurerId === policy.insurerId && o.franchiseChf === line.renewalFranchiseChf)
        .sort((a, b) => a.monthlyPremiumRp - b.monthlyPremiumRp)
        .map((o) => [o.tariffCode, { code: o.tariffCode, label: o.tariffLabel, modelType: o.modelType, monthlyRp: o.monthlyPremiumRp }]),
    ).values()],
    renewalStatus: line.renewalStatus,
    market: marketStats(all.filter((o) => o.franchiseChf === (renewal?.franchiseChf ?? policy.franchiseChf)).map((o) => o.monthlyPremiumRp)),
  };
}
