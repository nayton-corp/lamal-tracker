import { ageClassFor } from "@/domain/age-class";
import { marketStats } from "@/domain/comparison/rank";
import type { AppContext } from "./context";
import { requireHousehold } from "./household";
import { ReviewError, syncStatus } from "./review";

/**
 * Clôture le rituel : crée les contrats de l'année cible à partir des décisions figées.
 * Les chiffres viennent des copies prises au moment de la décision, jamais d'un réimport.
 */
export function closeReview(ctx: AppContext, reviewId: number): void {
  syncStatus(ctx, reviewId);
  const review = ctx.reviews.review(reviewId);
  if (!review) throw new ReviewError("Rituel introuvable.");
  if (review.status === "CLOSED") return;
  const lines = ctx.reviews.lines(reviewId);
  const undecided = lines.filter((l) => l.decision === null);
  if (undecided.length > 0) throw new ReviewError("Toutes les personnes doivent avoir une décision avant la clôture.");
  ctx.db.transaction(() => {
    for (const line of lines) {
      const previous = line.currentPolicyId ? ctx.household.policy(line.currentPolicyId) : undefined;
      if (line.chosenInsurerId === null || line.chosenMonthlyRp === null) continue;
      ctx.household.savePolicy({
        personId: line.personId,
        coverageYear: review.targetYear,
        insurerId: line.chosenInsurerId,
        policyNumber: line.decision === "SWITCH" ? (line.newPolicyNumber ?? "") : (previous?.policyNumber ?? ""),
        premiumTariffId: line.chosenTariffId,
        tariffCode: line.chosenTariffCode,
        tariffLabel: line.chosenLabel,
        modelType: (line.chosenModelType ?? previous?.modelType ?? "STANDARD") as never,
        franchiseChf: line.chosenFranchiseChf ?? previous?.franchiseChf ?? 300,
        accidentIncluded: line.chosenAccidentIncluded ?? previous?.accidentIncluded ?? false,
        billedMonthlyRp: line.chosenMonthlyRp,
        source: "REVIEW",
      });
    }
    ctx.reviews.updateReview(reviewId, { status: "CLOSED", closedAt: ctx.clock.nowIso() });
  });
}

export function reopenReview(ctx: AppContext, reviewId: number): void {
  const review = ctx.reviews.review(reviewId);
  if (!review) throw new ReviewError("Rituel introuvable.");
  ctx.reviews.updateReview(reviewId, { status: "DRAFT", closedAt: null });
  syncStatus(ctx, reviewId);
}

export interface HistoryPoint {
  year: number;
  /** Prime facturée mensuelle (contrat), ou décision/renouvellement pour l'année du rituel en cours. */
  monthlyRp: number | null;
  /** Prime nette annuelle : 12 × prime − redistribution CO2 (si connue). */
  netAnnualRp: number | null;
  insurerName: string | null;
  label: string | null;
  franchiseChf: number | null;
  /** Médiane du marché pour le même profil (franchise, accident, classe d'âge). */
  marketMedianRp: number | null;
  marketMinRp: number | null;
  projected: boolean;
}

export interface PersonHistory {
  personId: number;
  firstName: string;
  points: HistoryPoint[];
}

export function householdHistory(ctx: AppContext) {
  const h = requireHousehold(ctx);
  const persons = ctx.household.persons(h.id, true);
  const openReviews = ctx.reviews.reviews(h.id).filter((r) => r.status !== "CLOSED");
  const people: PersonHistory[] = persons.map((p) => {
    const points = new Map<number, HistoryPoint>();
    for (const policy of ctx.household.policies(p.id)) {
      const co2 = ctx.reference.co2(policy.coverageYear)?.annualAmountRp ?? null;
      points.set(policy.coverageYear, {
        year: policy.coverageYear,
        monthlyRp: policy.billedMonthlyRp,
        netAnnualRp: policy.billedMonthlyRp * 12 - (co2 ?? 0),
        insurerName: ctx.tariffs.insurerName(policy.insurerId),
        label: policy.tariffLabel,
        franchiseChf: policy.franchiseChf,
        marketMedianRp: null,
        marketMinRp: null,
        projected: false,
      });
    }
    for (const review of openReviews) {
      if (points.has(review.targetYear)) continue;
      const line = ctx.reviews.lines(review.id).find((l) => l.personId === p.id);
      if (!line) continue;
      const monthly = line.chosenMonthlyRp ?? line.renewalMonthlyRp;
      if (monthly === null) continue;
      points.set(review.targetYear, {
        year: review.targetYear,
        monthlyRp: monthly,
        netAnnualRp: monthly * 12 - (review.co2AnnualRp ?? 0),
        insurerName: line.chosenLabel ?? (line.renewalTariffId ? (ctx.tariffs.tariffById(line.renewalTariffId)?.insurerName ?? null) : null),
        label: line.chosenLabel ?? line.renewalLabel,
        franchiseChf: line.chosenFranchiseChf ?? line.renewalFranchiseChf,
        marketMedianRp: null,
        marketMinRp: null,
        projected: true,
      });
    }
    for (const point of points.values()) {
      if (point.franchiseChf === null || Number(p.birthDate.slice(0, 4)) > point.year) continue;
      const accident = ctx.household.policyFor(p.id, point.year)?.accidentIncluded ?? ctx.household.prefs(p.id).accidentIncluded;
      const market = ctx.tariffs
        .marketByYear({
          canton: h.canton,
          region: h.region,
          ageClass: ageClassFor(p.birthDate, point.year),
          franchiseChf: point.franchiseChf,
          accidentIncluded: accident,
        })
        .filter((m) => m.year === point.year)
        .map((m) => m.premium);
      const stats = marketStats(market);
      point.marketMedianRp = stats?.medianRp ?? null;
      point.marketMinRp = stats?.minRp ?? null;
    }
    return {
      personId: p.id,
      firstName: p.firstName,
      points: [...points.values()].sort((a, b) => a.year - b.year),
    };
  });
  const years = [...new Set(people.flatMap((p) => p.points.map((pt) => pt.year)))].sort((a, b) => a - b);
  const totals = years.map((year) => {
    const pts = people.map((p) => p.points.find((pt) => pt.year === year)).filter((x) => x !== undefined);
    return {
      year,
      monthlyRp: pts.reduce((s, pt) => s + (pt.monthlyRp ?? 0), 0),
      annualRp: pts.reduce((s, pt) => s + (pt.monthlyRp ?? 0) * 12, 0),
      netAnnualRp: pts.reduce((s, pt) => s + (pt.netAnnualRp ?? 0), 0),
      projected: pts.some((pt) => pt.projected),
      persons: pts.length,
    };
  });
  return { people, totals, years };
}
