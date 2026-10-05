/** Tout ce qu'affiche la page du rituel : personnes, meilleure offre, échéances, totaux, étapes. */
import { and, asc, eq } from "drizzle-orm";
import { ageTransition } from "@/domain/age";
import { costOf, filterOffers, rankOffers, type Offer, type RankedOffer } from "@/domain/comparison";
import { daysBetween, type IsoDate } from "@/domain/dates";
import { reviewDeadlines, urgency } from "@/domain/deadlines";
import { type ModelType } from "@/domain/lamal";
import { changePermille } from "@/domain/money";
import { franchisesFor } from "@/domain/parameters";
import { pingenFailed } from "@/domain/pingen";
import { checkLetter, lcaWarnings, type LetterCheck, type LcaWarning } from "@/domain/review";
import type { Db } from "@/infrastructure/db/client";
import { insurerAddressLines, insurerLabel, offersFor, parametersFor } from "@/infrastructure/db/queries";
import { insurer, lamalPolicy, lcaPolicy, letter, person, review, reviewLine } from "@/infrastructure/db/schema";
import { findLine, ownedReview, type Scope } from "../scope";
import { ritualSteps, type RitualStep } from "@/domain/ritual-steps";
import { type LineRow, type PersonRow, type PolicyRow, offerScope } from "./lines";

// ───────────────────────── Vue de la revue ─────────────────────────

export interface PersonReview {
  line: LineRow;
  person: PersonRow;
  policy: PolicyRow;
  currentInsurer: string;
  chosenInsurer: string | null;
  transition: string | null;
  /** Hausse mensuelle du renouvellement par rapport à la prime facturée. */
  increaseRp: number | null;
  increasePermille: number | null;
  best: RankedOffer | null;
  renewalTotalRp: number | null;
  lcaWarnings: LcaWarning[];
  lcaCount: number;
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
  persons: PersonReview[];
  totals: {
    currentMonthlyRp: number;
    renewalMonthlyRp: number | null;
    chosenMonthlyRp: number | null;
    bestMonthlyRp: number | null;
    potentialAnnualSavingsRp: number;
  };
  letters: (typeof letter.$inferSelect & { insurerName: string })[];
  steps: RitualStep[];
}

function bestOfferFor(
  db: Db,
  r: typeof review.$inferSelect,
  line: LineRow,
  p: PersonRow,
  offers: Offer[] = offersFor(db, offerScope(db, r, line)),
): { best: RankedOffer | null; renewalTotalRp: number | null } {
  const params = parametersFor(db, r.targetYear);
  const ctx = { ageClass: line.targetAgeClass, params, healthCostsRp: p.healthCostsRp };
  const renewalTotalRp =
    line.renewalMonthlyRp === null
      ? null
      : costOf({ monthlyPremiumRp: line.renewalMonthlyRp, franchiseChf: line.renewalFranchiseChf }, ctx).totalRp;
  const filtered = filterOffers(offers, {
    models: p.allowedModels as ModelType[],
    franchises: franchisesFor(params, line.targetAgeClass),
    excludedInsurerIds: p.excludedInsurerIds,
  });
  const ranked = rankOffers(filtered, { ...ctx, referenceTotalRp: renewalTotalRp });
  return { best: ranked[0] ?? null, renewalTotalRp };
}

export function getReviewView(db: Db, scope: Scope, reviewId: number, today: IsoDate): ReviewView {
  const r = ownedReview(db, scope, reviewId);
  const deadlines = reviewDeadlines(r.targetYear);
  const lines = db.select().from(reviewLine).where(eq(reviewLine.reviewId, r.id)).orderBy(asc(reviewLine.id)).all();
  const insurers = new Map(db.select().from(insurer).all().map((i) => [i.id, i]));
  const params = parametersFor(db, r.targetYear);

  const persons: PersonReview[] = lines.map((line) => {
    const p = db.select().from(person).where(eq(person.id, line.personId)).get()!;
    const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
    const current = insurers.get(policy.insurerId)!;
    const lca = db.select().from(lcaPolicy).where(and(eq(lcaPolicy.personId, p.id), eq(lcaPolicy.active, true))).all();
    const { best, renewalTotalRp } = r.status === "CLOSED" ? { best: null, renewalTotalRp: null } : bestOfferFor(db, r, line, p);
    return {
      line,
      person: p,
      policy,
      currentInsurer: insurerLabel(current),
      chosenInsurer: line.chosenInsurerId ? insurerLabel(insurers.get(line.chosenInsurerId)!) : null,
      transition: ageTransition(p.birthDate, r.targetYear)?.message ?? null,
      increaseRp: line.renewalMonthlyRp === null ? null : line.renewalMonthlyRp - policy.billedMonthlyRp,
      increasePermille: line.renewalMonthlyRp === null ? null : changePermille(policy.billedMonthlyRp, line.renewalMonthlyRp),
      best,
      renewalTotalRp,
      lcaWarnings: lcaWarnings(
        lca.map((c) => ({ productName: c.productName, insurerName: c.insurerName, linkedInsurerId: c.linkedInsurerId })),
        policy.insurerId,
        insurerLabel(current),
      ),
      lcaCount: lca.length,
      letterCheck: checkLetter({
        decision: line.decision,
        currentInsurerId: policy.insurerId,
        chosenInsurerId: line.chosenInsurerId,
        lcaAckAt: line.lcaAckAt,
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
    .where(eq(letter.reviewId, r.id))
    .orderBy(asc(letter.id))
    .all()
    .map((l) => ({ ...l, insurerName: insurerLabel(insurers.get(l.insurerId)!) }));

  // Une lettre refusée par Pingen reste à reprendre : la démarche n'est pas faite.
  const sentLineIds = new Set(letters.filter((l) => l.sentAt && !pingenFailed(l.pingenStatus)).flatMap((l) => l.lineIds));

  return {
    review: r,
    today,
    deadlines,
    urgency: urgency(today, deadlines),
    daysToDeadline: daysBetween(today, deadlines.receiptDeadline),
    daysToSend: daysBetween(today, deadlines.sendBy),
    co2KnownForTarget: params.co2AnnualRp !== null,
    persons,
    totals: {
      currentMonthlyRp: persons.reduce((a, x) => a + x.policy.billedMonthlyRp, 0),
      renewalMonthlyRp: sum(persons.map((x) => x.line.renewalMonthlyRp)),
      chosenMonthlyRp: sum(persons.map((x) => x.line.chosenMonthlyRp)),
      bestMonthlyRp: sum(persons.map((x) => x.best?.monthlyPremiumRp ?? null)),
      potentialAnnualSavingsRp: persons.reduce((a, x) => a + Math.max(x.best?.savingsRp ?? 0, 0), 0),
    },
    letters,
    steps: ritualSteps({
      lines: persons.map((x) => ({
        decision: x.line.decision,
        renewalKnown: x.line.renewalMonthlyRp !== null,
        lcaConfirmed: x.line.lcaAckAt !== null,
        affiliationRequested: x.line.affiliationRequestedAt !== null,
        affiliationConfirmed: x.line.affiliationConfirmedAt !== null,
        letterSent: sentLineIds.has(x.line.id),
      })),
      strategyChosen: r.strategy !== null,
      needsConfirmed: r.needsConfirmedAt !== null,
      terminationsAcknowledged: letters.filter((l) => l.kind === "TERMINATION").every((l) => l.acknowledgedAt),
    }),
  };
}

/** Lignes d'un rituel du foyer, dans l'ordre, avec le prénom de chaque personne (onglets, enchaînement). */
export function reviewMembers(db: Db, scope: Scope, reviewId: number) {
  ownedReview(db, scope, reviewId);
  return db
    .select({ id: reviewLine.id, decision: reviewLine.decision, firstName: person.firstName })
    .from(reviewLine)
    .innerJoin(person, eq(person.id, reviewLine.personId))
    .where(eq(reviewLine.reviewId, reviewId))
    .orderBy(asc(reviewLine.id))
    .all();
}

/** Une ligne du foyer avec son rituel, son contrat actuel et sa caisse ; null si elle n'est pas au foyer. */
export function lineOverview(db: Db, scope: Scope, lineId: number) {
  const line = findLine(db, scope, lineId);
  if (!line) return null;
  const r = db.select().from(review).where(eq(review.id, line.reviewId)).get()!;
  const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const currentInsurer = db.select().from(insurer).where(eq(insurer.id, policy.insurerId)).get()!;
  return { line, review: r, policy, currentInsurer };
}
