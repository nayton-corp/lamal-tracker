import { asc, eq } from "drizzle-orm";
import { bestPerInsurer, filterOffers, rankOffers, type Offer, type RankedOffer } from "@/domain/comparison";
import { costOf } from "@/domain/comparison";
import type { InsurerProfile } from "@/domain/insurer-profile";
import { MODEL_TYPES, type ModelType } from "@/domain/lamal";
import { franchisesFor } from "@/domain/parameters";
import { qualityPoints, STRATEGIES, strategyDefaults, type Strategy } from "@/domain/strategy";
import type { Db } from "@/infrastructure/db/client";
import { offersFor, parametersFor } from "@/infrastructure/db/queries";
import { household, lamalPolicy, person, review, reviewLine } from "@/infrastructure/db/schema";
import { ownedLine, ownedReview, type Scope } from "./scope";
import { insurerProfiles } from "./insurers";
import { NotFoundError, UserError } from "./errors";

/*
 * Préférences du rituel : stratégie du foyer et besoins de chaque personne. `lineContext` rassemble ce qu'il faut pour
 * classer les offres d'une personne ; le comparateur (compare.ts) s'en sert aussi.
 */

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
  costContext: Parameters<typeof costOf>[1];
}

/**
 * Contexte de calcul d'une personne du rituel (vérifie que la ligne appartient au foyer).
 * `healthCostsRp` remplace les frais enregistrés, pour une simulation dans le comparateur.
 */
export function lineContext(db: Db, scope: Scope, lineId: number, healthCostsRp?: number): LineContext {
  const line = ownedLine(db, scope, lineId);
  const r = db.select().from(review).where(eq(review.id, line.reviewId)).get()!;
  const personRow = db.select().from(person).where(eq(person.id, line.personId)).get()!;
  const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const householdRow = db.select().from(household).where(eq(household.id, r.householdId)).get()!;
  const params = parametersFor(db, r.targetYear);
  const allowedFranchises = franchisesFor(params, line.targetAgeClass);
  const ctx = { ageClass: line.targetAgeClass, params, healthCostsRp: healthCostsRp ?? personRow.healthCostsRp };
  const profile = { canton: householdRow.canton, region: householdRow.region, ageClass: line.targetAgeClass, accident: line.accident, subgroup: line.subgroup };
  const offers = offersFor(db, { datasetId: r.datasetId, ...profile }).filter((o) => allowedFranchises.includes(o.franchiseChf));
  const profiles = insurerProfiles(db, { ...profile, targetYear: r.targetYear });
  const qualityById: Record<number, number> = {};
  for (const [id, profile] of profiles) qualityById[id] = qualityPoints(profile);
  const renewalTotalRp =
    line.renewalMonthlyRp === null ? null : costOf({ monthlyPremiumRp: line.renewalMonthlyRp, franchiseChf: line.renewalFranchiseChf }, ctx).totalRp;
  return { line, review: r, person: personRow, policy, offers, quality: (id) => qualityById[id] ?? 0, qualityById, profiles, allowedFranchises, renewalTotalRp, costContext: ctx };
}

/**
 * Filtres effectifs d'une ligne : ceux du questionnaire des besoins (pré-remplis par la stratégie),
 * sinon les préférences de la personne. Franchise null = toutes, modèles vides = tous.
 */
export function effectiveNeeds(c: Pick<LineContext, "line" | "person">): { models: ModelType[]; franchiseChf: number | null } {
  return { models: (c.line.wishModels ?? c.person.allowedModels) as ModelType[], franchiseChf: c.line.wishFranchiseChf };
}

/** Offres classées par coût réel de l'année, une par caisse, avec les filtres de la ligne. */
export function rankedFor(c: LineContext, overrides: { models?: ModelType[]; franchiseChf?: number | null } = {}): RankedOffer[] {
  const needs = effectiveNeeds(c);
  const models = overrides.models ?? needs.models;
  const franchise = overrides.franchiseChf !== undefined ? overrides.franchiseChf : needs.franchiseChf;
  const filtered = filterOffers(c.offers, {
    models,
    franchises: franchise === null ? undefined : [franchise],
    excludedInsurerIds: c.person.excludedInsurerIds,
  });
  return bestPerInsurer(rankOffers(filtered, { ...c.costContext, referenceTotalRp: c.renewalTotalRp }));
}

/** Réglages par défaut d'une stratégie pour une personne. */
export function defaultsFor(c: Pick<LineContext, "line" | "policy">, strategy: Strategy) {
  return strategyDefaults(strategy, { modelType: c.policy.modelType as ModelType, franchiseChf: c.line.renewalFranchiseChf });
}

export interface StrategyOverview {
  strategy: Strategy;
  /** Économie annuelle du foyer par rapport à la reconduction (null si un renouvellement est inconnu). */
  annualSavingsRp: number | null;
  persons: { lineId: number; firstName: string; offer: RankedOffer | null }[];
}

/** Aperçu des stratégies pour le foyer : ce que chacune ferait économiser avec ses réglages par défaut. */
export function strategyOverview(db: Db, scope: Scope, reviewId: number): StrategyOverview[] {
  ownedReview(db, scope, reviewId);
  const lines = db.select().from(reviewLine).where(eq(reviewLine.reviewId, reviewId)).orderBy(asc(reviewLine.id)).all();
  const contexts = lines.map((l) => lineContext(db, scope, l.id));
  return STRATEGIES.map((strategy) => {
    const persons = contexts.map((c) => ({ lineId: c.line.id, firstName: c.person.firstName, offer: rankedFor(c, defaultsFor(c, strategy))[0] ?? null }));
    const savings = persons.map((p) => p.offer?.savingsRp ?? null);
    return {
      strategy,
      annualSavingsRp: savings.some((s) => s === null) ? null : savings.reduce<number>((a, s) => a + Math.max(s ?? 0, 0), 0),
      persons,
    };
  });
}

function openReviewRow(db: Db, scope: Scope, reviewId: number) {
  const reviewRow = ownedReview(db, scope, reviewId);
  if (reviewRow.status === "CLOSED") throw new UserError("Ce rituel est clôturé.");
  return reviewRow;
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

/**
 * Enregistre les préférences du rituel : la stratégie du foyer et les besoins de chaque personne
 * (pré-remplis par la stratégie, éventuellement affinés). Ouvre ensuite le comparateur.
 */
export function savePreferences(db: Db, scope: Scope, reviewId: number, strategy: Strategy, needs: NeedsInput[], nowIso: string) {
  const reviewRow = openReviewRow(db, scope, reviewId);
  if (!STRATEGIES.includes(strategy)) throw new UserError("Stratégie inconnue.");
  db.transaction((tx) => {
    for (const n of needs) {
      const line = tx.select().from(reviewLine).where(eq(reviewLine.id, n.lineId)).get();
      if (!line || line.reviewId !== reviewRow.id) throw new NotFoundError("Personne");
      const models = n.models.filter((m): m is ModelType => (MODEL_TYPES as readonly string[]).includes(m));
      if (!Number.isInteger(n.healthCostsRp) || n.healthCostsRp < 0) throw new UserError("Frais de santé invalides.");
      if ((n.doctorName?.length ?? 0) > 200) throw new UserError("Nom du médecin trop long (200 caractères au plus).");
      tx.update(reviewLine).set({ wishFranchiseChf: n.franchiseChf, wishModels: models }).where(eq(reviewLine.id, line.id)).run();
      tx.update(person).set({ healthCostsRp: n.healthCostsRp, doctorName: n.doctorName }).where(eq(person.id, line.personId)).run();
    }
    tx.update(review).set({ strategy, needsConfirmedAt: nowIso }).where(eq(review.id, reviewRow.id)).run();
  });
}
