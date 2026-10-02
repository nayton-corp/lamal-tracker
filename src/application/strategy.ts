import { and, asc, eq } from "drizzle-orm";
import { bestPerInsurer, filterOffers, rankOffers, type Offer, type RankedOffer } from "@/domain/comparison";
import { costOf } from "@/domain/comparison";
import type { InsurerProfile } from "@/domain/insurer-profile";
import { MODEL_TYPES, type ModelType } from "@/domain/lamal";
import { franchisesFor } from "@/domain/parameters";
import { qualityPoints, rankForStrategy, STRATEGIES, strategyDefaults, type Strategy } from "@/domain/strategy";
import type { Db } from "@/infrastructure/db/client";
import { offersFor, parametersFor } from "@/infrastructure/db/queries";
import { lamalPolicy, person, review, reviewLine } from "@/infrastructure/db/schema";
import { getHousehold } from "./household";
import { insurerProfiles } from "./insurers";
import { UserError } from "./review";

type LineRow = typeof reviewLine.$inferSelect;
type ReviewRow = typeof review.$inferSelect;
type PersonRow = typeof person.$inferSelect;
type PolicyRow = typeof lamalPolicy.$inferSelect;

export interface LineContext {
  line: LineRow;
  review: ReviewRow;
  person: PersonRow;
  policy: PolicyRow;
  /** Toutes les offres du profil de l'année cible, franchises autorisées seulement. */
  offers: Offer[];
  /** Points de solidité par caisse (−3 à +3). */
  quality: (insurerId: number) => number;
  qualityById: Record<number, number>;
  profiles: Map<number, InsurerProfile>;
  allowedFranchises: number[];
  renewalTotalRp: number | null;
  ctx: Parameters<typeof costOf>[1];
}

export function lineContext(db: Db, lineId: number, healthCostsRp?: number): LineContext {
  const line = db.select().from(reviewLine).where(eq(reviewLine.id, lineId)).get();
  if (!line) throw new UserError("Ligne introuvable.");
  const r = db.select().from(review).where(eq(review.id, line.reviewId)).get()!;
  const p = db.select().from(person).where(eq(person.id, line.personId)).get()!;
  const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const h = getHousehold(db)!;
  const params = parametersFor(db, r.targetYear);
  const allowedFranchises = franchisesFor(params, line.targetAgeClass);
  const ctx = { ageClass: line.targetAgeClass, params, healthCostsRp: healthCostsRp ?? p.healthCostsRp };
  const scope = { canton: h.canton, region: h.region, ageClass: line.targetAgeClass, accident: line.accident, subgroup: line.subgroup };
  const offers = offersFor(db, { datasetId: r.datasetId, ...scope }).filter((o) => allowedFranchises.includes(o.franchiseChf));
  const profiles = insurerProfiles(db, { ...scope, targetYear: r.targetYear });
  const qualityById: Record<number, number> = {};
  for (const [id, profile] of profiles) qualityById[id] = qualityPoints(profile);
  const renewalTotalRp =
    line.renewalMonthlyRp === null ? null : costOf({ monthlyPremiumRp: line.renewalMonthlyRp, franchiseChf: line.renewalFranchiseChf }, ctx).totalRp;
  return { line, review: r, person: p, policy, offers, quality: (id) => qualityById[id] ?? 0, qualityById, profiles, allowedFranchises, renewalTotalRp, ctx };
}

/**
 * Filtres effectifs d'une ligne : ceux du questionnaire des besoins (pré-remplis par la stratégie),
 * sinon les préférences de la personne. Franchise null = toutes, modèles vides = tous.
 */
export function effectiveNeeds(c: Pick<LineContext, "line" | "person">): { models: ModelType[]; franchiseChf: number | null } {
  return { models: (c.line.wishModels ?? c.person.allowedModels) as ModelType[], franchiseChf: c.line.wishFranchiseChf };
}

/** Offres classées pour une stratégie, une par caisse, avec les filtres de la ligne. */
export function rankedForStrategy(c: LineContext, strategy: Strategy, overrides: { models?: ModelType[]; franchiseChf?: number | null } = {}): RankedOffer[] {
  const needs = effectiveNeeds(c);
  const models = overrides.models ?? needs.models;
  const franchise = overrides.franchiseChf !== undefined ? overrides.franchiseChf : needs.franchiseChf;
  const filtered = filterOffers(c.offers, {
    models,
    franchises: franchise === null ? undefined : [franchise],
    excludedInsurerIds: c.person.excludedInsurerIds,
  });
  const ranked = rankOffers(filtered, { ...c.ctx, referenceTotalRp: c.renewalTotalRp });
  return bestPerInsurer(rankForStrategy(ranked, strategy, c.quality));
}

export interface StrategyPick {
  strategy: Strategy;
  offer: RankedOffer | null;
}

/** Meilleure offre de chaque stratégie pour une personne (réglages par défaut de la stratégie). */
export function picksFor(c: LineContext): StrategyPick[] {
  return STRATEGIES.map((strategy) => {
    const d = strategyDefaults(strategy, { modelType: c.policy.modelType as ModelType, franchiseChf: c.line.renewalFranchiseChf });
    const offer = rankedForStrategy(c, strategy, { models: d.models ?? (c.person.allowedModels as ModelType[]), franchiseChf: d.franchiseChf })[0] ?? null;
    return { strategy, offer };
  });
}

export interface StrategyOverview {
  strategy: Strategy;
  /** Économie annuelle du foyer par rapport à la reconduction (null si un renouvellement est inconnu). */
  annualSavingsRp: number | null;
  persons: { lineId: number; firstName: string; offer: RankedOffer | null }[];
}

/** Aperçu des trois stratégies pour le foyer : ce que chacune ferait économiser. */
export function strategyOverview(db: Db, reviewId: number): StrategyOverview[] {
  const lines = db.select().from(reviewLine).where(eq(reviewLine.reviewId, reviewId)).orderBy(asc(reviewLine.id)).all();
  const contexts = lines.map((l) => lineContext(db, l.id));
  const picks = contexts.map((c) => ({ c, picks: picksFor(c) }));
  return STRATEGIES.map((strategy) => {
    const persons = picks.map(({ c, picks: ps }) => ({ lineId: c.line.id, firstName: c.person.firstName, offer: ps.find((p) => p.strategy === strategy)!.offer }));
    const savings = persons.map((p) => p.offer?.savingsRp ?? null);
    return {
      strategy,
      annualSavingsRp: savings.some((s) => s === null) ? null : savings.reduce<number>((a, s) => a + Math.max(s ?? 0, 0), 0),
      persons,
    };
  });
}

function openReviewRow(db: Db, reviewId: number) {
  const r = db.select().from(review).where(eq(review.id, reviewId)).get();
  if (!r) throw new UserError("Rituel introuvable.");
  if (r.status === "CLOSED") throw new UserError("Ce rituel est clôturé.");
  return r;
}

/**
 * Choisit la stratégie du foyer. Les besoins des personnes encore sans décision repartent des
 * réglages de la stratégie (ils restent modifiables à l'étape suivante).
 */
export function setStrategy(db: Db, reviewId: number, strategy: Strategy) {
  const r = openReviewRow(db, reviewId);
  db.transaction((tx) => {
    tx.update(review).set({ strategy, needsConfirmedAt: null }).where(eq(review.id, r.id)).run();
    const lines = tx.select().from(reviewLine).where(and(eq(reviewLine.reviewId, r.id), eq(reviewLine.decision, "UNDECIDED"))).all();
    for (const l of lines) {
      const policy = tx.select().from(lamalPolicy).where(eq(lamalPolicy.id, l.currentPolicyId)).get()!;
      const d = strategyDefaults(strategy, { modelType: policy.modelType as ModelType, franchiseChf: l.renewalFranchiseChf });
      tx.update(reviewLine).set({ wishFranchiseChf: d.franchiseChf, wishModels: d.models }).where(eq(reviewLine.id, l.id)).run();
    }
  });
}

export interface NeedsInput {
  lineId: number;
  /** null = l'app choisit la franchise la plus avantageuse. */
  franchiseChf: number | null;
  /** Vide = tous les modèles. */
  models: string[];
  healthCostsRp: number;
  doctorName: string | null;
}

/** Enregistre le questionnaire des besoins de chaque personne et ouvre le comparateur. */
export function saveNeeds(db: Db, reviewId: number, needs: NeedsInput[], nowIso: string) {
  const r = openReviewRow(db, reviewId);
  db.transaction((tx) => {
    for (const n of needs) {
      const line = tx.select().from(reviewLine).where(eq(reviewLine.id, n.lineId)).get();
      if (!line || line.reviewId !== r.id) throw new UserError("Personne introuvable dans ce rituel.");
      const models = n.models.filter((m): m is ModelType => (MODEL_TYPES as readonly string[]).includes(m));
      if (n.healthCostsRp < 0) throw new UserError("Frais de santé invalides.");
      tx.update(reviewLine).set({ wishFranchiseChf: n.franchiseChf, wishModels: models }).where(eq(reviewLine.id, line.id)).run();
      tx.update(person).set({ healthCostsRp: n.healthCostsRp, doctorName: n.doctorName }).where(eq(person.id, line.personId)).run();
    }
    tx.update(review).set({ needsConfirmedAt: nowIso }).where(eq(review.id, r.id)).run();
  });
}
