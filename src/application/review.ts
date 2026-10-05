import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ageClassForYear, ageTransition } from "@/domain/age";
import { costOf, filterOffers, rankOffers, type Offer, type RankedOffer } from "@/domain/comparison";
import { daysBetween, type IsoDate } from "@/domain/dates";
import { reviewDeadlines, urgency } from "@/domain/deadlines";
import { subgroupFor, type ModelType } from "@/domain/lamal";
import { changePermille } from "@/domain/money";
import { franchisesFor } from "@/domain/parameters";
import { pingenFailed } from "@/domain/pingen";
import { findRenewal } from "@/domain/renewal";
import { checkLetter, lcaWarnings, type LetterCheck, type LcaWarning } from "@/domain/review";
import type { Db } from "@/infrastructure/db/client";
import { activeDataset, insurerAddressLines, insurerLabel, offersFor, parametersFor } from "@/infrastructure/db/queries";
import {
  household,
  insurer,
  lamalPolicy,
  lcaPolicy,
  letter,
  person,
  review,
  reviewLine,
  tariffLineage,
} from "@/infrastructure/db/schema";
import { UserError } from "./errors";
import { listPersons } from "./household";
import { bumpUsage } from "./usage";
import { findLetter, findLine, findReview, householdIdOf, ownedLetter, ownedLine, ownedReview, type Scope } from "./scope";


type LineRow = typeof reviewLine.$inferSelect;
type PersonRow = typeof person.$inferSelect;
type PolicyRow = typeof lamalPolicy.$inferSelect;

/** Profil de primes d'une ligne : région du foyer de la revue, classe d'âge, accident. */
function offerScope(db: Db, reviewRow: typeof review.$inferSelect, line: Pick<LineRow, "targetAgeClass" | "accident" | "subgroup">) {
  const h = db.select().from(household).where(eq(household.id, reviewRow.householdId)).get();
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
  const subgroup = subgroupFor(ageClass, p.kidSubgroup);
  const accident = policy.accident;
  const params = parametersFor(db, reviewRow.targetYear);
  const offers = offersFor(db, offerScope(db, reviewRow, { targetAgeClass: ageClass, accident, subgroup }));
  const lineage = policy.tariffCode
    ? db
        .select()
        .from(tariffLineage)
        .where(
          and(
            eq(tariffLineage.householdId, reviewRow.householdId),
            eq(tariffLineage.insurerId, policy.insurerId),
            eq(tariffLineage.fromYear, reviewRow.targetYear - 1),
            eq(tariffLineage.fromCode, policy.tariffCode),
            eq(tariffLineage.toYear, reviewRow.targetYear),
          ),
        )
        .get()
    : undefined;
  const result = findRenewal(
    { insurerId: policy.insurerId, tariffCode: policy.tariffCode, tariffLabel: policy.tariffLabel, modelType: policy.modelType as ModelType, franchiseChf: policy.franchiseChf },
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
export function openReview(db: Db, scope: Scope, targetYear: number): { reviewId: number; skipped: string[] } {
  const h = { id: householdIdOf(scope) };
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

  const persons = listPersons(db, h.id);
  if (!persons.some((p) => currentPolicy(db, p.id, targetYear - 1))) {
    db.delete(review).where(and(eq(review.id, row.id), eq(review.status, "OPEN"))).run();
    throw new UserError(`Indiquez d'abord ${persons.length > 1 ? "les contrats" : "votre contrat"} ${targetYear - 1}.`);
  }
  const skipped: string[] = [];
  for (const p of persons) {
    const policy = currentPolicy(db, p.id, targetYear - 1);
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

/**
 * Pendant la fenêtre du rituel, l'analyse s'ouvre d'elle-même dès que les primes de l'année
 * cible sont publiées et qu'au moins une personne a son contrat de l'année en cours.
 */
export function ensureReview(db: Db, scope: Scope, targetYear: number): number | null {
  const existing = getReviewByYear(db, scope, targetYear);
  if (existing) return existing.id;
  if (scope.householdId === null || !activeDataset(db, targetYear)) return null;
  const anyContract = listPersons(db, scope.householdId).some((p) => currentPolicy(db, p.id, targetYear - 1));
  return anyContract ? openReview(db, scope, targetYear).reviewId : null;
}

function currentPolicy(db: Db, personId: number, year: number) {
  return db.select().from(lamalPolicy).where(and(eq(lamalPolicy.personId, personId), eq(lamalPolicy.coverageYear, year))).get() ?? null;
}

/**
 * Rituel en cours : le dernier non clôturé, quelle que soit l'année (en décembre et janvier,
 * l'année civile a changé mais les confirmations et la clôture restent à faire).
 */
export function activeReview(db: Db, scope: Scope) {
  if (scope.householdId === null) return null;
  return db.select().from(review).where(and(eq(review.householdId, scope.householdId), eq(review.status, "OPEN"))).orderBy(desc(review.targetYear)).get() ?? null;
}

export function getReviewByYear(db: Db, scope: Scope, targetYear: number) {
  if (scope.householdId === null) return null;
  return db.select().from(review).where(and(eq(review.householdId, scope.householdId), eq(review.targetYear, targetYear))).get() ?? null;
}

function loadLine(db: Db, scope: Scope, lineId: number) {
  const line = ownedLine(db, scope, lineId);
  const r = db.select().from(review).where(eq(review.id, line.reviewId)).get()!;
  const policy = db.select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const p = db.select().from(person).where(eq(person.id, line.personId)).get()!;
  if (r.status === "CLOSED") throw new UserError("Cette revue est clôturée.");
  return { line, review: r, policy, person: p };
}

/** Confirme à quel tarif de l'année cible correspond le tarif actuel, puis recalcule la ligne. */
export function confirmLineage(db: Db, scope: Scope, lineId: number, toCode: string) {
  const { line, review: r, policy, person: p } = loadLine(db, scope, lineId);
  if (!policy.tariffCode) throw new UserError("Le contrat actuel n'a pas de code tarif : choisissez le tarif de renouvellement dans le contrat.");
  db.insert(tariffLineage)
    .values({ householdId: r.householdId, insurerId: policy.insurerId, fromYear: r.targetYear - 1, fromCode: policy.tariffCode, toYear: r.targetYear, toCode })
    .onConflictDoUpdate({
      target: [tariffLineage.householdId, tariffLineage.insurerId, tariffLineage.fromYear, tariffLineage.fromCode, tariffLineage.toYear],
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
export function decide(db: Db, scope: Scope, lineId: number, choice: Choice, nowIso: string) {
  const { line, review: r, policy, person: p } = loadLine(db, scope, lineId);
  const offers = offersFor(db, offerScope(db, r, line));
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
export function keepAsIs(db: Db, scope: Scope, lineId: number, nowIso: string) {
  const { line, policy } = loadLine(db, scope, lineId);
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

export function undoDecision(db: Db, scope: Scope, lineId: number) {
  const { line } = loadLine(db, scope, lineId);
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

export function acknowledgeLca(db: Db, scope: Scope, lineId: number, nowIso: string) {
  loadLine(db, scope, lineId);
  db.update(reviewLine).set({ lcaAckAt: nowIso }).where(eq(reviewLine.id, lineId)).run();
}

export function setLineFlags(
  db: Db,
  scope: Scope,
  lineId: number,
  flags: { doctorCheck?: "YES" | "NO" | "UNKNOWN"; affiliationRequestedAt?: string | null; affiliationConfirmedAt?: string | null },
) {
  loadLine(db, scope, lineId);
  if (flags.doctorCheck !== undefined && !["YES", "NO", "UNKNOWN"].includes(flags.doctorCheck)) throw new UserError("Réponse inconnue.");
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

  const needsLetter = persons.filter((x) => x.line.decision === "SWITCH" || x.line.decision === "ADJUST");
  const switching = persons.filter((x) => x.line.decision === "SWITCH");
  // Une lettre refusée par Pingen reste à reprendre : la démarche n'est pas faite.
  const sentLineIds = new Set(letters.filter((l) => l.sentAt && !pingenFailed(l.pingenStatus)).flatMap((l) => l.lineIds));
  const allDecided = persons.length > 0 && persons.every((x) => x.line.decision !== "UNDECIDED");

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
      { key: "renewal", label: "Hausse", done: persons.length > 0 && persons.every((x) => x.line.renewalMonthlyRp !== null) },
      { key: "strategy", label: "Stratégie", done: r.strategy !== null || allDecided },
      { key: "needs", label: "Besoins", done: r.needsConfirmedAt !== null || allDecided },
      { key: "decide", label: "Choix", done: allDecided },
      { key: "procedures", label: "Démarches", done: switching.every((x) => x.line.lcaAckAt && x.line.affiliationRequestedAt) && needsLetter.every((x) => sentLineIds.has(x.line.id)) },
      { key: "confirmed", label: "Confirmé", done: switching.every((x) => x.line.affiliationConfirmedAt) && letters.filter((l) => l.kind === "TERMINATION").every((l) => l.acknowledgedAt) },
    ]),
  };
}

function sequential(steps: { key: string; label: string; done: boolean }[]) {
  // « Reconduction » est indépendante ; les étapes suivantes s'enchaînent à partir des décisions.
  let ok = true;
  return steps.map((s, i) => {
    if (i === 0) return s;
    ok = ok && s.done;
    return { ...s, done: ok };
  });
}

/** Crée les contrats de l'année cible à partir des décisions, puis clôt la revue. */
export function closeReview(db: Db, scope: Scope, reviewId: number, nowIso: string) {
  const r = ownedReview(db, scope, reviewId);
  if (r.status === "CLOSED") return;
  const lines = db.select().from(reviewLine).where(eq(reviewLine.reviewId, reviewId)).all();
  const undecided = lines.filter((l) => l.decision === "UNDECIDED" || l.chosenMonthlyRp === null);
  if (undecided.length) throw new UserError("Toutes les personnes doivent avoir une décision avant la clôture.");
  db.transaction((tx) => {
    for (const l of lines) {
      const prev = tx.select().from(lamalPolicy).where(eq(lamalPolicy.id, l.currentPolicyId)).get()!;
      const existing = tx
        .select()
        .from(lamalPolicy)
        .where(and(eq(lamalPolicy.personId, l.personId), eq(lamalPolicy.coverageYear, r.targetYear)))
        .get();
      if (existing?.source === "MANUAL") {
        const p = tx.select({ firstName: person.firstName }).from(person).where(eq(person.id, l.personId)).get();
        throw new UserError(
          `Un contrat ${r.targetYear} saisi à la main existe déjà pour ${p?.firstName ?? "cette personne"} : supprimez-le ou gardez-le.`,
        );
      }
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
      // Un contrat importé (OFSP) ou issu d'une clôture précédente est remplacé par la décision.
      if (existing) tx.update(lamalPolicy).set(values).where(eq(lamalPolicy.id, existing.id)).run();
      else tx.insert(lamalPolicy).values(values).run();
    }
    tx.update(review).set({ status: "CLOSED", closedAt: nowIso }).where(eq(review.id, reviewId)).run();
  });
}

/**
 * Annule la clôture : retire les contrats de l'année cible créés par la clôture et rouvre la revue.
 * Les décisions restent, on peut les modifier puis clôturer à nouveau.
 */
export function reopenReview(db: Db, scope: Scope, reviewId: number) {
  const r = ownedReview(db, scope, reviewId);
  if (r.status !== "CLOSED") return;
  const created = createdPolicies(db, r.id, r.targetYear);
  const ids = created.map((p) => p.id);
  if (ids.length) {
    const usedBy = db.select().from(reviewLine).where(inArray(reviewLine.currentPolicyId, ids)).get();
    if (usedBy) {
      const later = db.select().from(review).where(eq(review.id, usedBy.reviewId)).get()!;
      throw new UserError(`Le rituel ${later.targetYear} s'appuie sur ces contrats : supprimez-le d'abord.`);
    }
  }
  db.transaction((tx) => {
    if (ids.length) tx.delete(lamalPolicy).where(inArray(lamalPolicy.id, ids)).run();
    tx.update(review).set({ status: "OPEN", closedAt: null }).where(eq(review.id, r.id)).run();
  });
}

/** Supprime le rituel (décisions et lettres comprises), même clôturé : on revient à l'état d'avant. */
export function deleteReview(db: Db, scope: Scope, reviewId: number) {
  const r = findReview(db, scope, reviewId);
  if (!r) return;
  reopenReview(db, scope, reviewId);
  db.delete(review).where(eq(review.id, reviewId)).run();
}

function createdPolicies(db: Db, reviewId: number, targetYear: number) {
  const personIds = db
    .select({ personId: reviewLine.personId })
    .from(reviewLine)
    .where(eq(reviewLine.reviewId, reviewId))
    .all()
    .map((l) => l.personId);
  if (!personIds.length) return [];
  return db
    .select()
    .from(lamalPolicy)
    .where(
      and(
        inArray(lamalPolicy.personId, personIds),
        eq(lamalPolicy.coverageYear, targetYear),
        eq(lamalPolicy.source, "REVIEW"),
      ),
    )
    .all();
}

export function deleteLetter(db: Db, scope: Scope, letterId: number) {
  const l = findLetter(db, scope, letterId);
  if (!l) return;
  if (l.sentAt) throw new UserError("Une lettre envoyée ne peut pas être supprimée.");
  db.delete(letter).where(eq(letter.id, letterId)).run();
}

export function markLetterSent(db: Db, scope: Scope, letterId: number, sentAt: string, trackingNumber: string | null) {
  const row = ownedLetter(db, scope, letterId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sentAt)) throw new UserError("Date d'envoi au format AAAA-MM-JJ.");
  if (trackingNumber && trackingNumber.length > 60) throw new UserError("Numéro de suivi trop long.");
  db.transaction((tx) => {
    tx.update(letter).set({ sentAt, trackingNumber }).where(eq(letter.id, letterId)).run();
    if (!row.sentAt) bumpUsage(tx, "letters.sent");
  });
}

export function markLetterAcknowledged(db: Db, scope: Scope, letterId: number, at: string | null) {
  ownedLetter(db, scope, letterId);
  db.update(letter).set({ acknowledgedAt: at }).where(eq(letter.id, letterId)).run();
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

/** Frais de santé attendus de la personne d'une ligne (comparateur). */
export function setHealthCosts(db: Db, scope: Scope, lineId: number, amountRp: number) {
  if (!Number.isInteger(amountRp) || amountRp < 0) throw new UserError("Montant invalide.");
  const line = ownedLine(db, scope, lineId);
  db.update(person).set({ healthCostsRp: amountRp }).where(eq(person.id, line.personId)).run();
}
