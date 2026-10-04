import {
  bestPerInsurer,
  cheapestPerFranchise,
  filterOffers,
  marketStats,
  rankOffers,
  type RankedOffer,
  type SortKey,
} from "@/domain/comparison";
import { breakEvenRp, costScenarios, franchiseCurve, type CostScenarios, type CurvePoint } from "@/domain/cost";
import type { InsurerProfile } from "@/domain/insurer-profile";
import type { ModelType } from "@/domain/lamal";
import { coinsuranceMaxFor } from "@/domain/parameters";
import { rankForStrategy, type Strategy } from "@/domain/strategy";
import type { Db } from "@/infrastructure/db/client";
import { insurer } from "@/infrastructure/db/schema";
import type { Scope } from "./scope";
import { effectiveNeeds, lineContext, picksFor, type StrategyPick } from "./strategy";

export interface CompareOptions {
  /** Modèles retenus ; absent = besoins de la personne, vide = tous. */
  models?: ModelType[];
  /** Franchises retenues ; absent = besoins de la personne, vide = toutes. */
  franchises?: number[];
  healthCostsRp?: number;
  /** « strategy » : classement de la stratégie du rituel (par défaut quand elle est choisie). */
  sort?: SortKey | "strategy";
  /** Ignore les exclusions et modèles préférés de la personne. */
  all?: boolean;
  /** Toutes les offres de chaque caisse, au lieu de sa meilleure seulement. */
  everyOffer?: boolean;
}

export interface InsurerCard {
  website: string | null;
  phone: string | null;
  email: string | null;
  profile: InsurerProfile | null;
}

export interface DetailedOffer extends RankedOffer {
  scenarios: CostScenarios;
  /** Prime du modèle standard de la même caisse (même franchise, même couverture accident). */
  standardMonthlyRp: number | null;
}

export const offerKey = (o: { tariffId: number; franchiseChf: number }) => `${o.tariffId}-${o.franchiseChf}`;

export interface CompareView {
  lineId: number;
  targetYear: number;
  personName: string;
  allowedFranchises: number[];
  healthCostsRp: number;
  offers: DetailedOffer[];
  totalOffers: number;
  renewal: { monthlyRp: number; totalRp: number; label: string | null; franchiseChf: number } | null;
  chosen: { tariffCode: string | null; franchiseChf: number | null; insurerId: number | null };
  currentInsurerId: number;
  curve: { franchises: number[]; points: CurvePoint[]; breakEvenRp: number | null };
  /** Tarifs de l'assureur actuel (franchise de renouvellement), pour confirmer un renouvellement incertain. */
  renewalCandidates: { code: string; label: string; modelType: ModelType; monthlyRp: number }[];
  renewalStatus: string;
  market: ReturnType<typeof marketStats>;
  /** Portrait de chaque caisse présente dans les offres (comptes OFSP, évolution des primes). */
  insurers: Record<number, InsurerCard>;
  /** Plafond annuel de quote-part de la personne. */
  coinsuranceMaxRp: number;
  /** Nombre d'offres avant regroupement par caisse. */
  matchingOffers: number;
  strategy: Strategy | null;
  sort: SortKey | "strategy";
  /** Filtres appliqués (après besoins et paramètres d'URL). */
  effective: { models: ModelType[]; franchiseChf: number | null };
  /** Points de solidité de chaque caisse (−3 à +3), pour l'équilibre. */
  quality: Record<number, number>;
  /** Meilleure offre selon chacune des trois stratégies. */
  picks: StrategyPick[];
}

export function compareForLine(db: Db, scope: Scope, lineId: number, opts: CompareOptions = {}): CompareView {
  const c = lineContext(db, scope, lineId, opts.healthCostsRp);
  const { line, review: r, person: p, policy, ctx, allowedFranchises } = c;
  const params = ctx.params;
  const healthCostsRp = ctx.healthCostsRp;
  const all = c.offers;

  const renewal =
    line.renewalMonthlyRp === null
      ? null
      : {
          monthlyRp: line.renewalMonthlyRp,
          totalRp: c.renewalTotalRp!,
          label: line.renewalLabel,
          franchiseChf: line.renewalFranchiseChf,
        };

  const needs = effectiveNeeds(c);
  const models = opts.models ?? (opts.all ? [] : needs.models);
  const franchises = opts.franchises ?? (needs.franchiseChf === null ? [] : [needs.franchiseChf]);
  const filtered = filterOffers(all, {
    models,
    franchises,
    excludedInsurerIds: opts.all ? [] : p.excludedInsurerIds,
  });
  const sort = opts.sort ?? (r.strategy ? "strategy" : "total");
  const byCost = rankOffers(filtered, { ...ctx, referenceTotalRp: renewal?.totalRp ?? null }, sort === "premium" ? "premium" : "total");
  const rankedAll = sort === "strategy" && r.strategy ? rankForStrategy(byCost, r.strategy, c.quality) : byCost;
  const ranked = opts.everyOffer ? rankedAll : bestPerInsurer(rankedAll);

  const profiles = c.profiles;
  const insurers: Record<number, InsurerCard> = {};
  for (const row of db.select({ id: insurer.id, website: insurer.website, phone: insurer.phone, email: insurer.email }).from(insurer).all()) {
    insurers[row.id] = { website: row.website, phone: row.phone, email: row.email, profile: profiles.get(row.id) ?? null };
  }
  const standard = new Map<string, number>();
  for (const o of all) {
    if (o.modelType !== "STANDARD") continue;
    const k = `${o.insurerId}-${o.franchiseChf}`;
    const prev = standard.get(k);
    if (prev === undefined || o.monthlyPremiumRp < prev) standard.set(k, o.monthlyPremiumRp);
  }
  const coinsuranceMaxRp = coinsuranceMaxFor(params, line.targetAgeClass);
  const detailed: DetailedOffer[] = ranked.map((o) => ({
    ...o,
    scenarios: costScenarios({
      monthlyPremiumRp: o.monthlyPremiumRp,
      franchiseChf: o.franchiseChf,
      healthCostsRp,
      coinsuranceRateBp: params.coinsuranceRateBp,
      coinsuranceMaxRp,
      co2AnnualRp: params.co2AnnualRp,
    }),
    standardMonthlyRp: standard.get(`${o.insurerId}-${o.franchiseChf}`) ?? null,
  }));

  const cheapest = cheapestPerFranchise(filterOffers(all, { models: opts.models }));
  const base = {
    coinsuranceRateBp: params.coinsuranceRateBp,
    coinsuranceMaxRp,
    co2AnnualRp: params.co2AnnualRp,
  };
  const maxH = line.targetAgeClass === "KID" ? 400_000 : 1_000_000;
  return {
    lineId,
    targetYear: r.targetYear,
    personName: `${p.firstName} ${p.lastName}`,
    allowedFranchises,
    healthCostsRp,
    offers: detailed,
    totalOffers: all.length,
    matchingOffers: rankedAll.length,
    coinsuranceMaxRp,
    insurers,
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
    strategy: r.strategy,
    sort,
    effective: { models, franchiseChf: franchises.length === 1 ? franchises[0]! : null },
    quality: c.qualityById,
    picks: picksFor(c),
  };
}
