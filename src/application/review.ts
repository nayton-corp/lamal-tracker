import { ageClassChange, ageClassFor, type AgeClass } from "@/domain/age-class";
import { yearOf } from "@/domain/calendar";
import {
  bestPerProduct,
  explainOffer,
  marketRank,
  marketStats,
  rankOffers,
  type ComparisonCriteria,
  type RankedOffer,
  type SortKey,
} from "@/domain/comparison/rank";
import { findRenewal, type MatchConfidence } from "@/domain/comparison/renewal";
import { costInputFor, expectedAnnualCost, franchiseCurve, recommendFranchise } from "@/domain/cost-model";
import { countdown, ordinaryTerminationDeadline } from "@/domain/deadlines";
import { requiresDoctorCheck, type ModelType } from "@/domain/insurance-model";
import { lcaWarningsForSwitch, type LcaPolicy } from "@/domain/lca";
import { allowedFranchises, type LamalParameters } from "@/domain/lamal-parameters";
import {
  canGenerateTerminationLetter,
  deriveReviewStatus,
  inferDecision,
  premiumChange,
  validateDecision,
  type Decision,
  type DoctorCheck,
} from "@/domain/review";
import type { Tariff } from "@/domain/tariff";
import type { LamalPolicyRow, PersonRow } from "@/infrastructure/db/household-repository";
import type { ReviewLineRow, ReviewRow } from "@/infrastructure/db/review-repository";
import type { AppContext } from "./context";
import { requireHousehold, ValidationError } from "./household";

export class ReviewError extends Error {}

// ─── Ouverture ───────────────────────────────────────────────────────────────

function currentPolicyFor(ctx: AppContext, personId: number, targetYear: number): LamalPolicyRow | undefined {
  return ctx.household.policyFor(personId, targetYear - 1) ?? ctx.household.latestPolicyBefore(personId, targetYear);
}

function policyDescriptor(ctx: AppContext, policy: LamalPolicyRow) {
  const linked = policy.premiumTariffId ? ctx.tariffs.tariffById(policy.premiumTariffId) : undefined;
  return {
    insurerId: policy.insurerId,
    tariffCode: linked?.tariffCode ?? policy.tariffCode,
    tariffLabel: linked?.tariffLabel ?? policy.tariffLabel,
    modelType: policy.modelType as ModelType,
    franchiseChf: policy.franchiseChf,
    accidentIncluded: policy.accidentIncluded,
    monthlyPremiumRp: policy.billedMonthlyRp,
  };
}

function computeLine(ctx: AppContext, review: Pick<ReviewRow, "targetYear" | "datasetId">, p: PersonRow) {
  const h = requireHousehold(ctx);
  const targetAgeClass = ageClassFor(p.birthDate, review.targetYear);
  const change = ageClassChange(p.birthDate, review.targetYear - 1, review.targetYear);
  const policy = currentPolicyFor(ctx, p.id, review.targetYear);
  let renewal: { tariff: Tariff | null; confidence: MatchConfidence } = { tariff: null, confidence: "NONE" };
  if (policy) {
    const params = ctx.reference.parameters(review.targetYear);
    const tariffs = ctx.tariffs.tariffs({
      datasetId: review.datasetId,
      canton: h.canton,
      region: h.region,
      ageClass: targetAgeClass,
      accidentIncluded: policy.accidentIncluded,
      insurerId: policy.insurerId,
    });
    const lineage = ctx.tariffs.lineageMap([policy.insurerId], policy.coverageYear, review.targetYear);
    const r = findRenewal(
      policyDescriptor(ctx, policy),
      tariffs,
      params,
      targetAgeClass,
      lineage,
      ctx.tariffs.defaultSubgroup(review.datasetId, targetAgeClass),
    );
    renewal = { tariff: r.tariff, confidence: r.confidence };
  }
  return {
    personId: p.id,
    currentPolicyId: policy?.id ?? null,
    targetAgeClass,
    ageClassChanged: change.changed,
    renewalTariffId: renewal.tariff?.id ?? null,
    renewalMonthlyRp: renewal.tariff?.monthlyPremiumRp ?? null,
    renewalConfidence: renewal.confidence,
    renewalLabel: renewal.tariff?.tariffLabel ?? null,
    renewalFranchiseChf: renewal.tariff?.franchiseChf ?? null,
  } as const;
}

const EMPTY_DECISION = {
  decision: null,
  chosenTariffId: null,
  chosenInsurerId: null,
  chosenTariffCode: null,
  chosenLabel: null,
  chosenModelType: null,
  chosenFranchiseChf: null,
  chosenAccidentIncluded: null,
  chosenMonthlyRp: null,
  chosenAnnualCostRp: null,
  decidedAt: null,
  doctorCheck: "UNKNOWN" as DoctorCheck,
  lcaAckAt: null,
  affiliationRequestedAt: null,
  affiliationConfirmedAt: null,
  newPolicyNumber: null,
};

/** Ouvre le rituel de l'année cible : retrouve le renouvellement de chaque contrat dans les nouveaux tarifs. */
export function openReview(ctx: AppContext, targetYear: number): number {
  const h = requireHousehold(ctx);
  const existing = ctx.reviews.reviewFor(h.id, targetYear);
  if (existing) return existing.id;
  const dataset = ctx.tariffs.activeDataset(targetYear);
  if (!dataset) throw new ReviewError(`Aucun tarif OFSP ${targetYear} actif : importe et active d'abord les primes ${targetYear}.`);
  const persons = ctx.household.persons(h.id).filter((p) => yearOf(p.birthDate) <= targetYear);
  if (persons.length === 0) throw new ReviewError("Ajoute au moins une personne au foyer.");
  const deadline = ordinaryTerminationDeadline(targetYear);
  const draft = { targetYear, datasetId: dataset.id };
  const lines = persons.map((p) => ({ ...computeLine(ctx, draft, p), ...EMPTY_DECISION }));
  return ctx.reviews.createReview(
    {
      householdId: h.id,
      targetYear,
      datasetId: dataset.id,
      deadlineDate: deadline.legalReceiptDate,
      recommendedSendBy: deadline.recommendedSendBy,
      co2AnnualRp: ctx.reference.co2(targetYear)?.annualAmountRp ?? null,
      status: "DRAFT",
    },
    lines,
  );
}

/**
 * Recalcule les renouvellements des lignes sans décision (contrat modifié, nouveau jeu actif…)
 * et ajoute les personnes arrivées dans le foyer. Les décisions déjà prises restent figées.
 */
export function refreshReview(ctx: AppContext, reviewId: number): void {
  const review = requireReview(ctx, reviewId);
  if (review.status === "CLOSED") throw new ReviewError("Ce rituel est clôturé.");
  const h = requireHousehold(ctx);
  const dataset = ctx.tariffs.activeDataset(review.targetYear);
  if (dataset && dataset.id !== review.datasetId && ctx.reviews.lines(reviewId).every((l) => l.decision === null)) {
    ctx.reviews.updateReview(reviewId, { datasetId: dataset.id });
    review.datasetId = dataset.id;
  }
  const lines = ctx.reviews.lines(reviewId);
  for (const p of ctx.household.persons(h.id)) {
    if (yearOf(p.birthDate) > review.targetYear) continue;
    const line = lines.find((l) => l.personId === p.id);
    if (!line) {
      ctx.reviews.addLine(reviewId, { ...computeLine(ctx, review, p), ...EMPTY_DECISION });
    } else if (line.decision === null && line.renewalConfidence !== "MANUAL") {
      ctx.reviews.updateLine(line.id, computeLine(ctx, review, p));
    }
  }
  ctx.reviews.updateReview(reviewId, { co2AnnualRp: ctx.reference.co2(review.targetYear)?.annualAmountRp ?? null });
  syncStatus(ctx, reviewId);
}

function requireReview(ctx: AppContext, reviewId: number): ReviewRow {
  const r = ctx.reviews.review(reviewId);
  if (!r) throw new ReviewError("Rituel introuvable.");
  return r;
}

function requireLine(ctx: AppContext, lineId: number): { line: ReviewLineRow; review: ReviewRow } {
  const line = ctx.reviews.line(lineId);
  if (!line) throw new ReviewError("Ligne introuvable.");
  const review = requireReview(ctx, line.reviewId);
  return { line, review };
}

function assertEditable(review: ReviewRow): void {
  if (review.status === "CLOSED") throw new ReviewError("Ce rituel est clôturé : les décisions ne peuvent plus changer.");
}

export function syncStatus(ctx: AppContext, reviewId: number): void {
  const review = requireReview(ctx, reviewId);
  const lines = ctx.reviews.lines(reviewId);
  const status = deriveReviewStatus(
    {
      lines: lines.map((l) => {
        const letter = ctx.reviews.letterForLine(l.id);
        return {
          decision: l.decision,
          lcaAckAt: l.lcaAckAt,
          letterSentAt: letter?.sentAt ?? null,
          insurerAckAt: letter?.insurerAckAt ?? null,
          affiliationConfirmedAt: l.affiliationConfirmedAt,
        };
      }),
    },
    review.status === "CLOSED",
  );
  if (status !== review.status) ctx.reviews.updateReview(reviewId, { status });
}

// ─── Vue d'ensemble ──────────────────────────────────────────────────────────

export interface LineOverview {
  line: ReviewLineRow;
  person: PersonRow;
  ageClass: AgeClass;
  ageClassWarning: string | null;
  current: (LamalPolicyRow & { insurerName: string }) | null;
  renewal: Tariff | null;
  change: ReturnType<typeof premiumChange> | null;
  best: RankedOffer | null;
  /** Économie annuelle attendue de la meilleure offre par rapport au renouvellement. */
  potentialSavingRp: number | null;
  market: { medianRp: number; minRp: number; rank: number; total: number } | null;
  activeLca: LcaPolicy[];
  alerts: string[];
  chosen: Tariff | null;
  letterId: number | null;
}

export interface ReviewOverview {
  review: ReviewRow;
  datasetYear: number;
  params: LamalParameters;
  lines: LineOverview[];
  totals: {
    currentMonthlyRp: number;
    renewalMonthlyRp: number;
    deltaMonthlyRp: number;
    changeBp: number | null;
    bestMonthlyRp: number;
    potentialSavingRp: number;
    chosenMonthlyRp: number | null;
    complete: boolean;
  };
  countdown: ReturnType<typeof countdown>;
  needsLca: boolean;
}

function toLcaPolicy(r: ReturnType<AppContext["household"]["lcaPolicies"]>[number]): LcaPolicy {
  return {
    id: r.id,
    personId: r.personId,
    insurerId: r.insurerId,
    productName: r.productName,
    category: r.category,
    policyNumber: r.policyNumber,
    startDate: r.startDate,
    minTermEnd: r.minTermEnd,
    noticeMonths: r.noticeMonths,
    bundledDiscount: r.bundledDiscount,
    status: r.status,
    monthlyPremiumRp: r.monthlyPremiumRp,
  };
}

export function criteriaFor(
  ctx: AppContext,
  personId: number,
  ageClass: AgeClass,
  accidentIncluded: boolean,
  co2AnnualRp: number | null,
  datasetId: number,
): ComparisonCriteria {
  const prefs = ctx.household.prefs(personId);
  return {
    ageClass,
    accidentIncluded,
    allowedModels: prefs.allowedModels as ModelType[],
    allowedFranchises: prefs.allowedFranchises,
    excludedInsurerIds: prefs.excludedInsurers,
    healthCostsRp: prefs.expectedHealthCostsRp,
    co2AnnualRp,
    sortBy: "expectedCost",
    ageSubgroup: ctx.tariffs.defaultSubgroup(datasetId, ageClass),
  };
}

export function reviewOverview(ctx: AppContext, reviewId: number): ReviewOverview {
  const review = requireReview(ctx, reviewId);
  const h = requireHousehold(ctx);
  const params = ctx.reference.parameters(review.targetYear);
  const lca = ctx.household.lcaPolicies(h.id).map(toLcaPolicy);
  const lines = ctx.reviews.lines(reviewId).map((line): LineOverview => {
    const person = ctx.household.person(line.personId)!;
    const policy = line.currentPolicyId ? (ctx.household.policy(line.currentPolicyId) ?? null) : null;
    const current = policy ? { ...policy, insurerName: ctx.tariffs.insurerName(policy.insurerId) } : null;
    const renewal = line.renewalTariffId ? (ctx.tariffs.tariffById(line.renewalTariffId) ?? null) : null;
    const accident = policy?.accidentIncluded ?? ctx.household.prefs(person.id).accidentIncluded;
    const criteria = criteriaFor(ctx, person.id, line.targetAgeClass, accident, review.co2AnnualRp, review.datasetId);
    const tariffs = ctx.tariffs.tariffs({
      datasetId: review.datasetId,
      canton: h.canton,
      region: h.region,
      ageClass: line.targetAgeClass,
      accidentIncluded: accident,
    });
    const renewalMonthly = line.renewalMonthlyRp;
    const reference =
      renewalMonthly !== null && line.renewalFranchiseChf !== null
        ? { monthlyPremiumRp: renewalMonthly, franchiseChf: line.renewalFranchiseChf }
        : null;
    const ranked = rankOffers(tariffs, params, criteria, reference);
    const best = ranked[0] ?? null;
    const sameFranchise = tariffs
      .filter((t) => t.franchiseChf === (line.renewalFranchiseChf ?? policy?.franchiseChf) && (t.ageSubgroup ?? "") === criteria.ageSubgroup)
      .map((t) => t.monthlyPremiumRp);
    const stats = marketStats(sameFranchise);
    const market =
      stats && renewalMonthly !== null ? { medianRp: stats.medianRp, minRp: stats.minRp, ...marketRank(sameFranchise, renewalMonthly) } : null;
    const activeLca = policy ? lcaWarningsForSwitch(lca, person.id, policy.insurerId).map((w) => w.policy) : [];
    const alerts: string[] = [];
    const ageChange = ageClassChange(person.birthDate, review.targetYear - 1, review.targetYear);
    if (!policy) alerts.push(`Aucun contrat ${review.targetYear - 1} saisi : ajoute le contrat actuel pour calculer la hausse.`);
    if (policy && policy.coverageYear !== review.targetYear - 1) {
      alerts.push(`Contrat ${review.targetYear - 1} manquant : comparaison faite avec le contrat ${policy.coverageYear}.`);
    }
    if (policy && line.renewalConfidence === "NONE") alerts.push("Tarif de renouvellement introuvable : choisis-le dans la liste.");
    if (line.renewalConfidence === "PROBABLE") alerts.push("Tarif de renouvellement probable : confirme-le.");
    const chosen = line.chosenTariffId ? (ctx.tariffs.tariffById(line.chosenTariffId) ?? null) : null;
    if (line.chosenModelType && requiresDoctorCheck(line.chosenModelType as ModelType) && line.doctorCheck !== "YES") {
      alerts.push("Vérifie que ton médecin figure sur la liste du nouveau modèle.");
    }
    return {
      line,
      person,
      ageClass: line.targetAgeClass,
      ageClassWarning: ageChange.warning,
      current,
      renewal,
      change: policy && renewalMonthly !== null ? premiumChange(policy.billedMonthlyRp, renewalMonthly) : null,
      best,
      potentialSavingRp: best?.annualSavingRp ?? null,
      market,
      activeLca,
      alerts,
      chosen,
      letterId: ctx.reviews.letterForLine(line.id)?.id ?? null,
    };
  });

  const known = lines.filter((l) => l.current && l.line.renewalMonthlyRp !== null);
  const currentMonthlyRp = known.reduce((s, l) => s + l.current!.billedMonthlyRp, 0);
  const renewalMonthlyRp = known.reduce((s, l) => s + l.line.renewalMonthlyRp!, 0);
  const chosenAll = lines.every((l) => l.line.decision !== null && l.line.chosenMonthlyRp !== null);
  return {
    review,
    datasetYear: ctx.tariffs.getDataset(review.datasetId)?.year ?? review.targetYear,
    params,
    lines,
    totals: {
      currentMonthlyRp,
      renewalMonthlyRp,
      deltaMonthlyRp: renewalMonthlyRp - currentMonthlyRp,
      changeBp: currentMonthlyRp > 0 ? Math.round(((renewalMonthlyRp - currentMonthlyRp) * 10_000) / currentMonthlyRp) : null,
      bestMonthlyRp: lines.reduce((s, l) => s + (l.best?.tariff.monthlyPremiumRp ?? 0), 0),
      potentialSavingRp: lines.reduce((s, l) => s + Math.max(0, l.potentialSavingRp ?? 0), 0),
      chosenMonthlyRp: chosenAll ? lines.reduce((s, l) => s + (l.line.chosenMonthlyRp ?? 0), 0) : null,
      complete: known.length === lines.length,
    },
    countdown: countdown(ctx.clock.today(), review.recommendedSendBy),
    needsLca: lines.some((l) => l.line.decision === "SWITCH" && l.activeLca.length > 0),
  };
}

// ─── Comparateur ─────────────────────────────────────────────────────────────

export interface OfferQuery {
  sortBy?: SortKey;
  models?: ModelType[];
  franchises?: number[];
  healthCostsRp?: number;
  onePerProduct?: boolean;
  accidentIncluded?: boolean;
  limit?: number;
}

export function offersForLine(ctx: AppContext, lineId: number, query: OfferQuery = {}) {
  const { line, review } = requireLine(ctx, lineId);
  const h = requireHousehold(ctx);
  const params = ctx.reference.parameters(review.targetYear);
  const policy = line.currentPolicyId ? ctx.household.policy(line.currentPolicyId) : undefined;
  const prefs = ctx.household.prefs(line.personId);
  const accident = query.accidentIncluded ?? policy?.accidentIncluded ?? prefs.accidentIncluded;
  const base = criteriaFor(ctx, line.personId, line.targetAgeClass, accident, review.co2AnnualRp, review.datasetId);
  const criteria: ComparisonCriteria = {
    ...base,
    sortBy: query.sortBy ?? "expectedCost",
    allowedModels: query.models ?? base.allowedModels,
    allowedFranchises: query.franchises ?? base.allowedFranchises,
    healthCostsRp: query.healthCostsRp ?? base.healthCostsRp,
  };
  const tariffs = ctx.tariffs.tariffs({
    datasetId: review.datasetId,
    canton: h.canton,
    region: h.region,
    ageClass: line.targetAgeClass,
    accidentIncluded: accident,
  });
  const reference =
    line.renewalMonthlyRp !== null && line.renewalFranchiseChf !== null
      ? { monthlyPremiumRp: line.renewalMonthlyRp, franchiseChf: line.renewalFranchiseChf }
      : null;
  let ranked = rankOffers(tariffs, params, criteria, reference);
  if (query.onePerProduct ?? true) ranked = bestPerProduct(ranked);
  const total = ranked.length;
  if (query.limit) ranked = ranked.slice(0, query.limit);
  return {
    review,
    line,
    params,
    criteria,
    reference,
    renewalTariffId: line.renewalTariffId,
    total,
    offers: ranked.map((o) => ({ ...o, reasons: explainOffer(o, reference) })),
    legalFranchises: allowedFranchises(params, line.targetAgeClass),
  };
}

/** Données du simulateur de franchise pour un produit (toutes ses franchises). */
export function franchiseSimulation(ctx: AppContext, lineId: number, tariffId: number, healthCostsRp: number) {
  const { line, review } = requireLine(ctx, lineId);
  const t = ctx.tariffs.tariffById(tariffId);
  if (!t) throw new ReviewError("Tarif introuvable.");
  const params = ctx.reference.parameters(review.targetYear);
  const h = requireHousehold(ctx);
  const variants = ctx.tariffs
    .tariffs({
      datasetId: t.datasetId,
      canton: h.canton,
      region: h.region,
      ageClass: line.targetAgeClass,
      accidentIncluded: t.accidentIncluded,
      insurerId: t.insurerId,
    })
    .filter((v) => v.tariffCode === t.tariffCode && v.ageSubgroup === t.ageSubgroup)
    .sort((a, b) => a.franchiseChf - b.franchiseChf);
  const options = variants.map((v) => ({ franchiseChf: v.franchiseChf, monthlyPremiumRp: v.monthlyPremiumRp, tariffId: v.id }));
  const maxCosts = Math.max(800_000, healthCostsRp * 2);
  return {
    tariff: t,
    options,
    curve: franchiseCurve(options, params, line.targetAgeClass, maxCosts, 40),
    recommendation: recommendFranchise(options, params, line.targetAgeClass, healthCostsRp),
    breakdowns: options.map((o) => ({
      ...o,
      cost: expectedAnnualCost(costInputFor(params, line.targetAgeClass, o.monthlyPremiumRp, o.franchiseChf, healthCostsRp, review.co2AnnualRp)),
    })),
  };
}

// ─── Décisions ───────────────────────────────────────────────────────────────

/** Confirme (ou choisit) le tarif de renouvellement et retient la lignée du produit. */
export function confirmRenewal(ctx: AppContext, lineId: number, tariffId: number): void {
  const { line, review } = requireLine(ctx, lineId);
  assertEditable(review);
  const t = ctx.tariffs.tariffById(tariffId);
  if (!t || t.datasetId !== review.datasetId) throw new ReviewError("Ce tarif n'appartient pas aux primes de ce rituel.");
  const policy = line.currentPolicyId ? ctx.household.policy(line.currentPolicyId) : undefined;
  if (policy && t.insurerId !== policy.insurerId) throw new ReviewError("Le renouvellement doit être chez la caisse actuelle.");
  ctx.reviews.updateLine(lineId, {
    renewalTariffId: t.id,
    renewalMonthlyRp: t.monthlyPremiumRp,
    renewalConfidence: "MANUAL",
    renewalLabel: t.tariffLabel,
    renewalFranchiseChf: t.franchiseChf,
  });
  if (policy) {
    const fromCode = policy.tariffCode ?? (policy.premiumTariffId ? ctx.tariffs.tariffById(policy.premiumTariffId)?.tariffCode : null);
    if (fromCode && fromCode !== t.tariffCode) {
      ctx.tariffs.confirmLineage(policy.insurerId, policy.coverageYear, fromCode, review.targetYear, t.tariffCode);
    }
  }
}

/** Choisit une offre : la décision (changement, franchise, modèle) est déduite puis figée avec ses chiffres. */
export function chooseOffer(ctx: AppContext, lineId: number, tariffId: number, explicit?: Decision): Decision {
  const { line, review } = requireLine(ctx, lineId);
  assertEditable(review);
  if (ctx.reviews.letterForLine(lineId)) {
    throw new ReviewError("Une lettre de résiliation existe pour cette personne : supprime-la avant de changer d'avis.");
  }
  const t = ctx.tariffs.tariffById(tariffId);
  if (!t || t.datasetId !== review.datasetId) throw new ReviewError("Cette offre n'appartient pas aux primes de ce rituel.");
  if (t.ageClass !== line.targetAgeClass) throw new ReviewError("Cette offre ne correspond pas à la classe d'âge.");
  const policy = line.currentPolicyId ? ctx.household.policy(line.currentPolicyId) : undefined;
  const current = policy ? { franchiseChf: policy.franchiseChf, modelType: policy.modelType, tariffCode: policy.tariffCode } : null;
  const renewal = line.renewalTariffId ? ctx.tariffs.tariffById(line.renewalTariffId) : undefined;
  const decision = explicit ?? (renewal && renewal.id === t.id ? "KEEP" : inferDecision(policy?.insurerId ?? null, current, t));
  const check =
    decision === "KEEP" && renewal && renewal.id !== t.id
      ? { ok: false, reasons: ["« Je reste » s'applique au tarif de renouvellement uniquement."] }
      : validateDecision(decision, policy?.insurerId ?? null, t, current);
  if (!check.ok) throw new ValidationError(check.reasons.join(" "));
  const params = ctx.reference.parameters(review.targetYear);
  const prefs = ctx.household.prefs(line.personId);
  const cost = expectedAnnualCost(
    costInputFor(params, line.targetAgeClass, t.monthlyPremiumRp, t.franchiseChf, prefs.expectedHealthCostsRp, review.co2AnnualRp),
  );
  ctx.reviews.updateLine(lineId, {
    decision,
    chosenTariffId: t.id,
    chosenInsurerId: t.insurerId,
    chosenTariffCode: t.tariffCode,
    chosenLabel: `${t.insurerName} – ${t.tariffLabel}`,
    chosenModelType: t.modelType,
    chosenFranchiseChf: t.franchiseChf,
    chosenAccidentIncluded: t.accidentIncluded,
    chosenMonthlyRp: t.monthlyPremiumRp,
    chosenAnnualCostRp: cost.totalRp,
    decidedAt: ctx.clock.nowIso(),
    lcaAckAt: decision === "SWITCH" ? line.lcaAckAt : null,
    doctorCheck: requiresDoctorCheck(t.modelType) ? line.doctorCheck : "UNKNOWN",
  });
  syncStatus(ctx, review.id);
  return decision;
}

/** « Je reste tel quel » : le renouvellement devient la décision. */
export function keepCurrent(ctx: AppContext, lineId: number): void {
  const { line } = requireLine(ctx, lineId);
  if (!line.renewalTariffId) throw new ReviewError("Confirme d'abord le tarif de renouvellement.");
  chooseOffer(ctx, lineId, line.renewalTariffId, "KEEP");
}

export function resetDecision(ctx: AppContext, lineId: number): void {
  const { review } = requireLine(ctx, lineId);
  assertEditable(review);
  if (ctx.reviews.letterForLine(lineId)) {
    throw new ReviewError("Une lettre de résiliation existe pour cette personne : supprime-la d'abord.");
  }
  ctx.reviews.updateLine(lineId, { ...EMPTY_DECISION });
  syncStatus(ctx, review.id);
}

/** Garde-fou LCA : enregistré seulement pour un changement de caisse. */
export function acknowledgeLca(ctx: AppContext, lineId: number): void {
  const { line, review } = requireLine(ctx, lineId);
  assertEditable(review);
  if (line.decision !== "SWITCH") throw new ReviewError("Le garde-fou LCA ne concerne qu'un changement de caisse.");
  ctx.reviews.updateLine(lineId, { lcaAckAt: ctx.clock.nowIso() });
  syncStatus(ctx, review.id);
}

export function setDoctorCheck(ctx: AppContext, lineId: number, value: DoctorCheck): void {
  const { review } = requireLine(ctx, lineId);
  assertEditable(review);
  ctx.reviews.updateLine(lineId, { doctorCheck: value });
}

export function setAffiliation(
  ctx: AppContext,
  lineId: number,
  input: { requested?: boolean; confirmed?: boolean; newPolicyNumber?: string | null },
): void {
  const { line, review } = requireLine(ctx, lineId);
  if (line.decision !== "SWITCH") throw new ReviewError("L'affiliation ne concerne qu'un changement de caisse.");
  const now = ctx.clock.nowIso();
  ctx.reviews.updateLine(lineId, {
    affiliationRequestedAt:
      input.requested === undefined ? line.affiliationRequestedAt : input.requested ? (line.affiliationRequestedAt ?? now) : null,
    affiliationConfirmedAt:
      input.confirmed === undefined ? line.affiliationConfirmedAt : input.confirmed ? (line.affiliationConfirmedAt ?? now) : null,
    newPolicyNumber: input.newPolicyNumber === undefined ? line.newPolicyNumber : input.newPolicyNumber || null,
  });
  syncStatus(ctx, review.id);
}

// ─── Lettres ─────────────────────────────────────────────────────────────────

export interface LetterGroup {
  insurerId: number;
  insurerName: string;
  lines: { line: ReviewLineRow; person: PersonRow; policy: LamalPolicyRow | undefined }[];
  check: { ok: boolean; reasons: string[] };
  address: ReturnType<AppContext["reference"]["terminationAddress"]>;
  letter: ReturnType<AppContext["reviews"]["letter"]>;
}

/** Regroupe les changements par caisse quittée : une lettre par caisse, pour toutes les personnes concernées. */
export function letterGroups(ctx: AppContext, reviewId: number): LetterGroup[] {
  const review = requireReview(ctx, reviewId);
  const h = requireHousehold(ctx);
  const lca = ctx.household.lcaPolicies(h.id).map(toLcaPolicy);
  const groups = new Map<number, LetterGroup>();
  for (const line of ctx.reviews.lines(reviewId)) {
    if (line.decision !== "SWITCH") continue;
    const policy = line.currentPolicyId ? ctx.household.policy(line.currentPolicyId) : undefined;
    if (!policy) continue;
    const person = ctx.household.person(line.personId)!;
    let g = groups.get(policy.insurerId);
    if (!g) {
      g = {
        insurerId: policy.insurerId,
        insurerName: ctx.tariffs.insurerName(policy.insurerId),
        lines: [],
        check: { ok: true, reasons: [] },
        address: ctx.reference.terminationAddress(policy.insurerId, review.targetYear - 1),
        letter: undefined,
      };
      groups.set(policy.insurerId, g);
    }
    g.lines.push({ line, person, policy });
  }
  for (const g of groups.values()) {
    const reasons = new Set<string>();
    for (const { line, person, policy } of g.lines) {
      const c = canGenerateTerminationLetter(
        {
          decision: line.decision,
          chosenTariffId: line.chosenTariffId,
          chosenInsurerId: line.chosenInsurerId,
          currentInsurerId: policy?.insurerId ?? null,
          lcaAckAt: line.lcaAckAt,
          activeLcaCount: lcaWarningsForSwitch(lca, person.id, g.insurerId).length,
          doctorCheck: line.doctorCheck,
          requiresDoctorCheck: requiresDoctorCheck((line.chosenModelType ?? "STANDARD") as ModelType),
        },
        Boolean(g.address),
      );
      c.reasons.forEach((r) => reasons.add(r));
      if (!policy?.policyNumber.trim()) reasons.add(`Numéro de police manquant pour ${person.firstName}.`);
      const letter = ctx.reviews.letterForLine(line.id);
      if (letter) g.letter = ctx.reviews.letter(letter.id);
    }
    g.check = { ok: reasons.size === 0, reasons: [...reasons] };
  }
  return [...groups.values()];
}
