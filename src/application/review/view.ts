/** Tout ce qu'affiche la page du bilan : personnes, meilleure offre, échéances, totaux, étapes. */
import { and, asc, eq } from "drizzle-orm";
import { ageTransition } from "@/domain/age";
import { costOf, filterOffers, rankOffers, type Offer, type RankedOffer } from "@/domain/comparison";
import { daysBetween, type IsoDate } from "@/domain/dates";
import { reviewDeadlines, urgency } from "@/domain/deadlines";
import { type ModelType } from "@/domain/lamal";
import { changePermille } from "@/domain/money";
import { franchisesFor } from "@/domain/parameters";
import { pingenFailed } from "@/domain/pingen";
import { checkLetter, type LetterCheck } from "@/domain/review";
import type { Db } from "@/infrastructure/db/client";
import { offersFor, parametersFor } from "@/infrastructure/db/queries";
import { insurerAddressLines, insurerLabel } from "@/domain/insurer";
import { insurer, lamalPolicy, lcaPolicy, letter, person, review, reviewLine } from "@/infrastructure/db/schema";
import { findLine, ownedReview, type Scope } from "../scope";
import { ritualSteps, type RitualStep } from "@/domain/ritual-steps";
import { type LineRow, type PersonRow, type PolicyRow, premiumProfileFor } from "./lines";

// ───────────────────────── Vue de la revue ─────────────────────────

export interface ReviewLineView {
  line: LineRow;
  person: PersonRow;
  policy: PolicyRow;
  currentInsurerName: string;
  chosenInsurerName: string | null;
  ageTransitionMessage: string | null;
  /** Hausse mensuelle du renouvellement par rapport à la prime facturée. */
  increaseRp: number | null;
  increasePermille: number | null;
  bestOffer: RankedOffer | null;
  renewalTotalRp: number | null;
  /** Économie annuelle attendue du choix fait (coût total), 0 pour « je garde » ; null sans choix. */
  chosenSavingsRp: number | null;
  /** Complémentaires LCA actives de la personne (« Hospitalisation demi-privée, Visana »). */
  lcaProducts: string[];
  letterCheck: LetterCheck;
}

export interface ReviewView {
  review: typeof review.$inferSelect;
  today: IsoDate;
  deadlines: ReturnType<typeof reviewDeadlines>;
  urgency: ReturnType<typeof urgency>;
  daysToDeadline: number;
  daysToSend: number;
  co2KnownForTarget: boolean;
  lines: ReviewLineView[];
  totals: {
    currentMonthlyRp: number;
    renewalMonthlyRp: number | null;
    chosenMonthlyRp: number | null;
    bestMonthlyRp: number | null;
    potentialAnnualSavingsRp: number;
    /** Somme des économies des choix déjà faits. */
    chosenAnnualSavingsRp: number;
  };
  letters: (typeof letter.$inferSelect & { insurerName: string })[];
  steps: RitualStep[];
}

function renewalTotalFor(db: Db, r: typeof review.$inferSelect, line: LineRow, p: PersonRow): number | null {
  if (line.renewalMonthlyRp === null) return null;
  const ctx = { ageClass: line.targetAgeClass, params: parametersFor(db, r.targetYear), healthCostsRp: p.healthCostsRp };
  return costOf({ monthlyPremiumRp: line.renewalMonthlyRp, franchiseChf: line.renewalFranchiseChf }, ctx).totalRp;
}

function chosenSavings(line: LineRow, renewalTotalRp: number | null): number | null {
  if (line.decision === "UNDECIDED") return null;
  if (line.decision === "KEEP") return 0;
  return renewalTotalRp === null || line.chosenTotalRp === null ? null : renewalTotalRp - line.chosenTotalRp;
}

function bestOfferFor(
  db: Db,
  r: typeof review.$inferSelect,
  line: LineRow,
  p: PersonRow,
  offers: Offer[] = offersFor(db, premiumProfileFor(db, r, line)),
): RankedOffer | null {
  const params = parametersFor(db, r.targetYear);
  const ctx = { ageClass: line.targetAgeClass, params, healthCostsRp: p.healthCostsRp };
  const renewalTotalRp = renewalTotalFor(db, r, line, p);
  const filtered = filterOffers(offers, {
    models: p.allowedModels as ModelType[],
    franchises: franchisesFor(params, line.targetAgeClass),
    excludedInsurerIds: p.excludedInsurerIds,
  });
  const ranked = rankOffers(filtered, { ...ctx, referenceTotalRp: renewalTotalRp });
  return ranked[0] ?? null;
}

/** Vue complète d'un bilan du foyer ; `today` sert aux échéances et à l'urgence affichée. */
export function getReviewView(db: Db, scope: Scope, reviewId: number, today: IsoDate): ReviewView {
  const reviewRow = ownedReview(db, scope, reviewId);
  const deadlines = reviewDeadlines(reviewRow.targetYear);
  const lineRows = db.select().from(reviewLine).where(eq(reviewLine.reviewId, reviewRow.id)).orderBy(asc(reviewLine.id)).all();
  const insurers = new Map(db.select().from(insurer).all().map((i) => [i.id, i]));
  const params = parametersFor(db, reviewRow.targetYear);

  const lineViews: ReviewLineView[] = lineRows.map((line) => {
    const personRow = db.select().from(person).where(eq(person.id, line.personId)).get()!;
    const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
    const current = insurers.get(policy.insurerId)!;
    const lca = db.select().from(lcaPolicy).where(and(eq(lcaPolicy.personId, personRow.id), eq(lcaPolicy.active, true))).all();
    const best = reviewRow.status === "CLOSED" ? null : bestOfferFor(db, reviewRow, line, personRow);
    const renewalTotalRp = renewalTotalFor(db, reviewRow, line, personRow);
    return {
      line,
      person: personRow,
      policy,
      currentInsurerName: insurerLabel(current),
      chosenInsurerName: line.chosenInsurerId ? insurerLabel(insurers.get(line.chosenInsurerId)!) : null,
      ageTransitionMessage: ageTransition(personRow.birthDate, reviewRow.targetYear)?.message ?? null,
      increaseRp: line.renewalMonthlyRp === null ? null : line.renewalMonthlyRp - policy.billedMonthlyRp,
      increasePermille: line.renewalMonthlyRp === null ? null : changePermille(policy.billedMonthlyRp, line.renewalMonthlyRp),
      bestOffer: best,
      renewalTotalRp,
      chosenSavingsRp: chosenSavings(line, renewalTotalRp),
      lcaProducts: lca.map((c) => `${c.productName}, ${c.insurerName}`),
      letterCheck: checkLetter({
        decision: line.decision,
        currentInsurerId: policy.insurerId,
        chosenInsurerId: line.chosenInsurerId,
        insurerHasAddress: insurerAddressLines(current).length > 0,
        policyNumber: policy.policyNumber,
        affiliationRequestedAt: line.affiliationRequestedAt,
      }),
    };
  });

  const sum = (xs: (number | null)[]) => (xs.some((x) => x === null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0));
  const letters = db
    .select()
    .from(letter)
    .where(eq(letter.reviewId, reviewRow.id))
    .orderBy(asc(letter.id))
    .all()
    .map((l) => ({ ...l, insurerName: insurerLabel(insurers.get(l.insurerId)!) }));

  // Une lettre refusée par Pingen reste à reprendre : la démarche n'est pas faite.
  const sentLineIds = new Set(letters.filter((l) => l.sentAt && !pingenFailed(l.pingenStatus)).flatMap((l) => l.lineIds));

  return {
    review: reviewRow,
    today,
    deadlines,
    urgency: urgency(today, deadlines),
    daysToDeadline: daysBetween(today, deadlines.receiptDeadline),
    daysToSend: daysBetween(today, deadlines.sendBy),
    co2KnownForTarget: params.co2AnnualRp !== null,
    lines: lineViews,
    totals: {
      currentMonthlyRp: lineViews.reduce((a, x) => a + x.policy.billedMonthlyRp, 0),
      renewalMonthlyRp: sum(lineViews.map((x) => x.line.renewalMonthlyRp)),
      chosenMonthlyRp: sum(lineViews.map((x) => x.line.chosenMonthlyRp)),
      bestMonthlyRp: sum(lineViews.map((x) => x.bestOffer?.monthlyPremiumRp ?? null)),
      potentialAnnualSavingsRp: lineViews.reduce((a, x) => a + Math.max(x.bestOffer?.savingsRp ?? 0, 0), 0),
      chosenAnnualSavingsRp: lineViews.reduce((a, x) => a + (x.chosenSavingsRp ?? 0), 0),
    },
    letters,
    steps: ritualSteps({
      lines: lineViews.map((x) => ({
        decision: x.line.decision,
        renewalKnown: x.line.renewalMonthlyRp !== null,
        affiliationRequested: x.line.affiliationRequestedAt !== null,
        letterSent: sentLineIds.has(x.line.id),
      })),
      preferencesSaved: reviewRow.needsConfirmedAt !== null,
    }),
  };
}

/** Lignes d'un bilan du foyer, dans l'ordre, avec le prénom de chaque personne (onglets, enchaînement). */
export function listReviewLineTabs(db: Db, scope: Scope, reviewId: number) {
  ownedReview(db, scope, reviewId);
  return db
    .select({ id: reviewLine.id, decision: reviewLine.decision, firstName: person.firstName })
    .from(reviewLine)
    .innerJoin(person, eq(person.id, reviewLine.personId))
    .where(eq(reviewLine.reviewId, reviewId))
    .orderBy(asc(reviewLine.id))
    .all();
}

/** Une ligne du foyer avec son bilan, son contrat actuel et sa caisse ; null si elle n'est pas au foyer. */
export function lineOverview(db: Db, scope: Scope, lineId: number) {
  const line = findLine(db, scope, lineId);
  if (!line) return null;
  const r = db.select().from(review).where(eq(review.id, line.reviewId)).get()!;
  const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const currentInsurer = db.select().from(insurer).where(eq(insurer.id, policy.insurerId)).get()!;
  return { line, review: r, policy, currentInsurer };
}
