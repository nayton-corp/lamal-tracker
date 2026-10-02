import { and, asc, eq, inArray } from "drizzle-orm";
import { ageClassForYear, ageTransition } from "@/domain/age";
import { costOf, filterOffers, rankOffers, type Offer, type RankedOffer } from "@/domain/comparison";
import { daysBetween, type IsoDate } from "@/domain/dates";
import { reviewDeadlines, urgency } from "@/domain/deadlines";
import { defaultSubgroup, type ModelType } from "@/domain/lamal";
import { changePermille } from "@/domain/money";
import { franchisesFor } from "@/domain/parameters";
import { findRenewal } from "@/domain/renewal";
import { checkLetter, lcaWarnings, type LetterCheck, type LcaWarning } from "@/domain/review";
import type { Db } from "@/infrastructure/db/client";
import { activeDataset, insurerLabel, offersFor, parametersFor } from "@/infrastructure/db/queries";
import {
  insurer,
  lamalPolicy,
  lcaPolicy,
  letter,
  person,
  review,
  reviewLine,
  tariffLineage,
} from "@/infrastructure/db/schema";
import { getHousehold, listPersons } from "./household";

export class UserError extends Error {}

type LineRow = typeof reviewLine.$inferSelect;
type PersonRow = typeof person.$inferSelect;
type PolicyRow = typeof lamalPolicy.$inferSelect;

function scopeFor(db: Db, reviewRow: typeof review.$inferSelect, line: Pick<LineRow, "targetAgeClass" | "accident" | "subgroup">) {
  const h = getHousehold(db);
  if (!h) throw new UserError("Foyer non configuré.");
  return {
    datasetId: reviewRow.datasetId,
    canton: h.canton,
    region: h.region,
    ageClass: line.targetAgeClass,
    accident: line.accident,
    subgroup: line.subgroup,
  };
}

function renewalFor(db: Db, reviewRow: typeof review.$inferSelect, p: PersonRow, policy: PolicyRow) {
  const ageClass = ageClassForYear(p.birthDate, reviewRow.targetYear);
  const subgroup = ageClass === "KID" ? p.kidSubgroup || "K1" : defaultSubgroup(ageClass);
  const accident = policy.accident;
  const params = parametersFor(db, reviewRow.targetYear);
  const offers = offersFor(db, scopeFor(db, reviewRow, { targetAgeClass: ageClass, accident, subgroup }));
  const lineage = policy.tariffCode
    ? db
        .select()
        .from(tariffLineage)
        .where(
          and(
            eq(tariffLineage.insurerId, policy.insurerId),
            eq(tariffLineage.fromYear, reviewRow.targetYear - 1),
            eq(tariffLineage.fromCode, policy.tariffCode),
            eq(tariffLineage.toYear, reviewRow.targetYear),
          ),
        )
        .get()
    : undefined;
  const result = findRenewal(
    { insurerId: policy.insurerId, tariffCode: policy.tariffCode, modelType: policy.modelType as ModelType, franchiseChf: policy.franchiseChf },
    offers,
    franchisesFor(params, ageClass),
    lineage?.toCode ?? null,
  );
  return {
    targetAgeClass: ageClass,
    accident,
    subgroup,
    renewalStatus: result.status,
    renewalTariffCode: result.offer?.tariffCode ?? null,
    renewalLabel: result.offer?.tariffLabel ?? null,
    renewalFranchiseChf: result.franchiseChf,
    renewalMonthlyRp: result.offer?.monthlyPremiumRp ?? null,
  };
}

/**
 * Ouvre (ou rafraîchit) la revue annuelle pour targetYear. Idempotent : les lignes déjà
 * décidées ne sont pas touchées, les autres sont recalculées sur le jeu actif.
 */
export function openReview(db: Db, targetYear: number): { reviewId: number; skipped: string[] } {
  const h = getHousehold(db);
  if (!h) throw new UserError("Configurez d'abord le foyer.");
  const dataset = activeDataset(db, targetYear);
  if (!dataset) throw new UserError(`Les primes ${targetYear} ne sont pas encore importées (page Données).`);

  let row = db.select().from(review).where(and(eq(review.householdId, h.id), eq(review.targetYear, targetYear))).get();
  if (!row) {
    row = db.insert(review).values({ householdId: h.id, targetYear, datasetId: dataset.id, status: "OPEN" }).returning().get();
  } else if (row.datasetId !== dataset.id && row.status !== "CLOSED") {
    db.update(review).set({ datasetId: dataset.id }).where(eq(review.id, row.id)).run();
    row = { ...row, datasetId: dataset.id };
  }
  if (row.status === "CLOSED") return { reviewId: row.id, skipped: [] };

  const skipped: string[] = [];
  for (const p of listPersons(db, h.id)) {
    const policy = db
      .select()
      .from(lamalPolicy)
      .where(and(eq(lamalPolicy.personId, p.id), eq(lamalPolicy.coverageYear, targetYear - 1)))
      .get();
    if (!policy) {
      skipped.push(`${p.firstName} ${p.lastName} (pas de contrat ${targetYear - 1})`);
      continue;
    }
    const computed = renewalFor(db, row, p, policy);
    const existing = db
      .select()
      .from(reviewLine)
      .where(and(eq(reviewLine.reviewId, row.id), eq(reviewLine.personId, p.id)))
      .get();
    if (!existing) {
      db.insert(reviewLine).values({ reviewId: row.id, personId: p.id, currentPolicyId: policy.id, ...computed }).run();
    } else if (existing.decision === "UNDECIDED") {
      db.update(reviewLine).set({ currentPolicyId: policy.id, ...computed }).where(eq(reviewLine.id, existing.id)).run();
    }
  }
  return { reviewId: row.id, skipped };
}

export function getReviewByYear(db: Db, targetYear: number) {
  const h = getHousehold(db);
  if (!h) return null;
  return db.select().from(review).where(and(eq(review.householdId, h.id), eq(review.targetYear, targetYear))).get() ?? null;
}

function loadLine(db: Db, lineId: number) {
  const line = db.select().from(reviewLine).where(eq(reviewLine.id, lineId)).get();
  if (!line) throw new UserError("Ligne introuvable.");
  const r = db.select().from(review).where(eq(review.id, line.reviewId)).get()!;
  const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const p = db.select().from(person).where(eq(person.id, line.personId)).get()!;
  if (r.status === "CLOSED") throw new UserError("Cette revue est clôturée.");
  return { line, review: r, policy, person: p };
}

/** Confirme à quel tarif de l'année cible correspond le tarif actuel, puis recalcule la ligne. */
export function confirmLineage(db: Db, lineId: number, toCode: string) {
  const { line, review: r, policy, person: p } = loadLine(db, lineId);
  if (!policy.tariffCode) throw new UserError("Le contrat actuel n'a pas de code tarif : choisissez le tarif de renouvellement dans le contrat.");
  db.insert(tariffLineage)
    .values({ insurerId: policy.insurerId, fromYear: r.targetYear - 1, fromCode: policy.tariffCode, toYear: r.targetYear, toCode })
    .onConflictDoUpdate({
      target: [tariffLineage.insurerId, tariffLineage.fromYear, tariffLineage.fromCode, tariffLineage.toYear],
      set: { toCode },
    })
    .run();
  db.update(reviewLine).set(renewalFor(db, r, p, policy)).where(eq(reviewLine.id, line.id)).run();
}

export interface Choice {
  tariffId: number;
  franchiseChf: number;
}

/** Enregistre un choix : la décision (garder, changer de caisse, ajuster) en découle. Valeurs figées. */
export function decide(db: Db, lineId: number, choice: Choice, nowIso: string) {
  const { line, review: r, policy, person: p } = loadLine(db, lineId);
  const offers = offersFor(db, scopeFor(db, r, line));
  const offer = offers.find((o) => o.tariffId === choice.tariffId && o.franchiseChf === choice.franchiseChf);
  if (!offer) throw new UserError("Offre introuvable pour ce profil.");
  const params = parametersFor(db, r.targetYear);
  const cost = costOf(offer, { ageClass: line.targetAgeClass, params, healthCostsRp: p.healthCostsRp });
  const sameInsurer = offer.insurerId === policy.insurerId;
  const isRenewal =
    sameInsurer && offer.tariffCode === line.renewalTariffCode && offer.franchiseChf === line.renewalFranchiseChf;
  const decision = isRenewal ? "KEEP" : sameInsurer ? "ADJUST" : "SWITCH";
  db.update(reviewLine)
    .set({
      decision,
      chosenInsurerId: offer.insurerId,
      chosenTariffCode: offer.tariffCode,
      chosenLabel: offer.tariffLabel,
      chosenModelType: offer.modelType,
      chosenFranchiseChf: offer.franchiseChf,
      chosenMonthlyRp: offer.monthlyPremiumRp,
      chosenTotalRp: cost.totalRp,
      decidedAt: nowIso,
    })
    .where(eq(reviewLine.id, line.id))
    .run();
  return decision;
}

/** Garder le contrat tel quel, même si le renouvellement n'a pas été retrouvé automatiquement. */
export function keepAsIs(db: Db, lineId: number, nowIso: string) {
  const { line, policy } = loadLine(db, lineId);
  if (line.renewalMonthlyRp === null) {
    throw new UserError("Renouvellement inconnu : confirmez d'abord le tarif correspondant de l'année prochaine.");
  }
  db.update(reviewLine)
    .set({
      decision: "KEEP",
      chosenInsurerId: policy.insurerId,
      chosenTariffCode: line.renewalTariffCode,
      chosenLabel: line.renewalLabel,
      chosenModelType: policy.modelType,
      chosenFranchiseChf: line.renewalFranchiseChf,
      chosenMonthlyRp: line.renewalMonthlyRp,
      chosenTotalRp: null,
      decidedAt: nowIso,
    })
    .where(eq(reviewLine.id, line.id))
    .run();
}

export function undoDecision(db: Db, lineId: number) {
  const { line } = loadLine(db, lineId);
  const sent = linesWithSentLetter(db, line.reviewId);
  if (sent.has(line.id)) throw new UserError("La lettre est déjà envoyée : la décision ne peut plus être annulée.");
  db.update(reviewLine)
    .set({
      decision: "UNDECIDED",
      chosenInsurerId: null,
      chosenTariffCode: null,
      chosenLabel: null,
      chosenModelType: null,
      chosenFranchiseChf: null,
      chosenMonthlyRp: null,
      chosenTotalRp: null,
      decidedAt: null,
    })
    .where(eq(reviewLine.id, line.id))
    .run();
}

export function acknowledgeLca(db: Db, lineId: number, nowIso: string) {
  loadLine(db, lineId);
  db.update(reviewLine).set({ lcaAckAt: nowIso }).where(eq(reviewLine.id, lineId)).run();
}

export function setLineFlags(
  db: Db,
  lineId: number,
  flags: { doctorCheck?: "YES" | "NO" | "UNKNOWN"; affiliationRequestedAt?: string | null; affiliationConfirmedAt?: string | null },
) {
  loadLine(db, lineId);
  db.update(reviewLine).set(flags).where(eq(reviewLine.id, lineId)).run();
}

function linesWithSentLetter(db: Db, reviewId: number): Set<number> {
  const sent = db.select().from(letter).where(eq(letter.reviewId, reviewId)).all().filter((l) => l.sentAt);
  return new Set(sent.flatMap((l) => l.lineIds));
}

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
  steps: { key: string; label: string; done: boolean }[];
}

export function bestOfferFor(
  db: Db,
  r: typeof review.$inferSelect,
  line: LineRow,
  p: PersonRow,
  offers: Offer[] = offersFor(db, scopeFor(db, r, line)),
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

export function getReviewView(db: Db, reviewId: number, today: IsoDate): ReviewView {
  const r = db.select().from(review).where(eq(review.id, reviewId)).get();
  if (!r) throw new UserError("Revue introuvable.");
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
        insurerHasAddress: Boolean(current.terminationAddress?.trim()),
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

  const needsLetter = persons.filter((x) => x.line.decision === "SWITCH" || x.line.decision === "ADJUST");
  const switching = persons.filter((x) => x.line.decision === "SWITCH");
  const letterLineIds = new Set(letters.flatMap((l) => l.lineIds));
  const sentLineIds = new Set(letters.filter((l) => l.sentAt).flatMap((l) => l.lineIds));

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
    // Une étape n'est faite que si les précédentes le sont (pas de coche « vide » avant les décisions).
    steps: sequential([
      { key: "renewal", label: "Hausse connue", done: persons.length > 0 && persons.every((x) => x.line.renewalMonthlyRp !== null) },
      { key: "decide", label: "Décisions", done: persons.length > 0 && persons.every((x) => x.line.decision !== "UNDECIDED") },
      { key: "lca", label: "Contrôle LCA", done: switching.every((x) => x.line.lcaAckAt) },
      { key: "letters", label: "Lettres", done: needsLetter.every((x) => letterLineIds.has(x.line.id)) },
      { key: "sent", label: "Envois", done: needsLetter.every((x) => sentLineIds.has(x.line.id)) },
    ]),
  };
}

function sequential(steps: { key: string; label: string; done: boolean }[]) {
  // « Hausse connue » est indépendante ; les étapes suivantes s'enchaînent à partir des décisions.
  let ok = true;
  return steps.map((s, i) => {
    if (i === 0) return s;
    ok = ok && s.done;
    return { ...s, done: ok };
  });
}

export function lineIdsOf(db: Db, reviewId: number): number[] {
  return db.select({ id: reviewLine.id }).from(reviewLine).where(eq(reviewLine.reviewId, reviewId)).all().map((r) => r.id);
}

/** Crée les contrats de l'année cible à partir des décisions, puis clôt la revue. */
export function closeReview(db: Db, reviewId: number, nowIso: string) {
  const r = db.select().from(review).where(eq(review.id, reviewId)).get();
  if (!r) throw new UserError("Revue introuvable.");
  if (r.status === "CLOSED") return;
  const lines = db.select().from(reviewLine).where(eq(reviewLine.reviewId, reviewId)).all();
  const undecided = lines.filter((l) => l.decision === "UNDECIDED" || l.chosenMonthlyRp === null);
  if (undecided.length) throw new UserError("Toutes les personnes doivent avoir une décision avant la clôture.");
  db.transaction((tx) => {
    for (const l of lines) {
      const prev = tx.select().from(lamalPolicy).where(eq(lamalPolicy.id, l.currentPolicyId)).get()!;
      const values = {
        personId: l.personId,
        coverageYear: r.targetYear,
        insurerId: l.chosenInsurerId!,
        policyNumber: l.decision === "SWITCH" ? null : prev.policyNumber,
        tariffCode: l.chosenTariffCode,
        tariffLabel: l.chosenLabel,
        modelType: (l.chosenModelType ?? prev.modelType) as ModelType,
        franchiseChf: l.chosenFranchiseChf!,
        accident: l.accident,
        billedMonthlyRp: l.chosenMonthlyRp!,
        source: "REVIEW" as const,
      };
      tx.insert(lamalPolicy).values(values).onConflictDoNothing().run();
    }
    tx.update(review).set({ status: "CLOSED", closedAt: nowIso }).where(eq(review.id, reviewId)).run();
  });
}

export function deleteLetter(db: Db, letterId: number) {
  const l = db.select().from(letter).where(eq(letter.id, letterId)).get();
  if (!l) return;
  if (l.sentAt) throw new UserError("Une lettre envoyée ne peut pas être supprimée.");
  db.delete(letter).where(eq(letter.id, letterId)).run();
}

export function markLetterSent(db: Db, letterId: number, sentAt: string, trackingNumber: string | null) {
  db.update(letter).set({ sentAt, trackingNumber }).where(eq(letter.id, letterId)).run();
}

export function markLetterAcknowledged(db: Db, letterId: number, at: string | null) {
  db.update(letter).set({ acknowledgedAt: at }).where(eq(letter.id, letterId)).run();
}

export function lettersByIds(db: Db, ids: number[]) {
  return ids.length ? db.select().from(letter).where(inArray(letter.id, ids)).all() : [];
}
