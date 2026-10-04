import { asc, eq } from "drizzle-orm";
import { ageClassForYear } from "@/domain/age";
import { marketStats } from "@/domain/comparison";
import { defaultSubgroup } from "@/domain/lamal";
import { changePermille } from "@/domain/money";
import type { Db } from "@/infrastructure/db/client";
import { activeDataset, insurerLabel, offersFor, parametersFor } from "@/infrastructure/db/queries";
import { insurer, lamalPolicy, person, review, reviewLine } from "@/infrastructure/db/schema";
import { getHousehold } from "./household";
import type { Scope } from "./scope";

export interface HistoryPoint {
  year: number;
  insurer: string;
  modelType: string;
  label: string | null;
  franchiseChf: number;
  billedMonthlyRp: number;
  netMonthlyRp: number;
  changePermille: number | null;
  marketMinRp: number | null;
  marketMedianRp: number | null;
}

export interface PersonHistory {
  personId: number;
  name: string;
  points: HistoryPoint[];
}

export interface YearTotal {
  year: number;
  billedMonthlyRp: number;
  netMonthlyRp: number;
  changePermille: number | null;
  complete: boolean;
  /** Somme, pour les personnes du foyer, de la prime la plus basse et médiane du marché (même franchise). */
  marketMinMonthlyRp: number | null;
  marketMedianMonthlyRp: number | null;
  marketMedianChangePermille: number | null;
}

export interface HistoryStats {
  /** Primes payées sur toutes les années connues (12 × prime facturée). */
  totalPaidRp: number;
  /** Économies annuelles décidées lors des rituels clôturés (renouvellement − choix). */
  ritualSavings: { year: number; annualRp: number }[];
  /** Hausse annuelle moyenne du foyer et du marché sur la période. */
  avgChangePermille: number | null;
  avgMarketChangePermille: number | null;
  /** Ce que le foyer aurait économisé l'an dernier connu avec la caisse la moins chère à franchise égale. */
  gapToCheapestAnnualRp: number | null;
}

export interface HouseholdHistory {
  years: number[];
  persons: PersonHistory[];
  totals: YearTotal[];
  stats: HistoryStats;
}

/** Historique pluriannuel : primes réellement facturées, nettes de CO2, et repères de marché. */
export function householdHistory(db: Db, scope: Scope): HouseholdHistory {
  const h = getHousehold(db, scope);
  if (!h) return { years: [], persons: [], totals: [], stats: { totalPaidRp: 0, ritualSavings: [], avgChangePermille: null, avgMarketChangePermille: null, gapToCheapestAnnualRp: null } };
  const persons = db.select().from(person).where(eq(person.householdId, h.id)).orderBy(asc(person.sortOrder), asc(person.birthDate)).all();
  const insurers = new Map(db.select().from(insurer).all().map((i) => [i.id, i]));
  const years = new Set<number>();

  const result: PersonHistory[] = persons.map((p) => {
    const policies = db.select().from(lamalPolicy).where(eq(lamalPolicy.personId, p.id)).orderBy(asc(lamalPolicy.coverageYear)).all();
    let prev: number | null = null;
    const points = policies.map((pol) => {
      years.add(pol.coverageYear);
      const params = parametersFor(db, pol.coverageYear);
      const co2Monthly = params.co2AnnualRp === null ? 0 : Math.round(params.co2AnnualRp / 12);
      const ds = activeDataset(db, pol.coverageYear);
      let market: ReturnType<typeof marketStats> = null;
      if (ds) {
        const ageClass = ageClassForYear(p.birthDate, pol.coverageYear);
        const offers = offersFor(db, {
          datasetId: ds.id,
          canton: h.canton,
          region: h.region,
          ageClass,
          accident: pol.accident,
          subgroup: ageClass === "KID" ? p.kidSubgroup : defaultSubgroup(ageClass),
        }).filter((o) => o.franchiseChf === pol.franchiseChf);
        market = marketStats(offers.map((o) => o.monthlyPremiumRp));
      }
      const point: HistoryPoint = {
        year: pol.coverageYear,
        insurer: insurerLabel(insurers.get(pol.insurerId)!),
        modelType: pol.modelType,
        label: pol.tariffLabel,
        franchiseChf: pol.franchiseChf,
        billedMonthlyRp: pol.billedMonthlyRp,
        netMonthlyRp: pol.billedMonthlyRp - co2Monthly,
        changePermille: prev === null ? null : changePermille(prev, pol.billedMonthlyRp),
        marketMinRp: market?.minRp ?? null,
        marketMedianRp: market?.medianRp ?? null,
      };
      prev = pol.billedMonthlyRp;
      return point;
    });
    return { personId: p.id, name: p.firstName, points };
  });

  const sortedYears = [...years].sort((a, b) => a - b);
  let prevTotal: number | null = null;
  let prevMedian: number | null = null;
  const totals: YearTotal[] = sortedYears.map((year) => {
    const pts = result.map((r) => r.points.find((pt) => pt.year === year)).filter((pt): pt is HistoryPoint => Boolean(pt));
    const billed = pts.reduce((a, pt) => a + pt.billedMonthlyRp, 0);
    const net = pts.reduce((a, pt) => a + pt.netMonthlyRp, 0);
    const withMarket = pts.every((pt) => pt.marketMinRp !== null && pt.marketMedianRp !== null) && pts.length > 0;
    const median = withMarket ? pts.reduce((a, pt) => a + pt.marketMedianRp!, 0) : null;
    const t: YearTotal = {
      year,
      billedMonthlyRp: billed,
      netMonthlyRp: net,
      changePermille: prevTotal === null ? null : changePermille(prevTotal, billed),
      complete: pts.length === result.length,
      marketMinMonthlyRp: withMarket ? pts.reduce((a, pt) => a + pt.marketMinRp!, 0) : null,
      marketMedianMonthlyRp: median,
      marketMedianChangePermille: prevMedian === null || median === null ? null : changePermille(prevMedian, median),
    };
    prevTotal = billed;
    prevMedian = median;
    return t;
  });
  return { years: sortedYears, persons: result, totals, stats: historyStats(db, h.id, result, totals) };
}

/** Hausse annuelle moyenne (composée), en pour mille, entre deux montants séparés de `years` ans. */
function cagrPermille(from: number, to: number, years: number): number | null {
  if (from <= 0 || to <= 0 || years <= 0) return null;
  return Math.round((Math.pow(to / from, 1 / years) - 1) * 1000);
}

function historyStats(db: Db, householdId: number, persons: PersonHistory[], totals: YearTotal[]): HistoryStats {
  const totalPaidRp = persons.reduce((a, p) => a + p.points.reduce((b, pt) => b + pt.billedMonthlyRp * 12, 0), 0);
  const closed = db.select().from(review).where(eq(review.householdId, householdId)).all().filter((r) => r.status === "CLOSED");
  const ritualSavings = closed
    .map((r) => {
      const lines = db.select().from(reviewLine).where(eq(reviewLine.reviewId, r.id)).all();
      const annualRp = lines.reduce(
        (a, l) => a + ((l.decision === "SWITCH" || l.decision === "ADJUST") && l.renewalMonthlyRp !== null && l.chosenMonthlyRp !== null ? (l.renewalMonthlyRp - l.chosenMonthlyRp) * 12 : 0),
        0,
      );
      return { year: r.targetYear, annualRp };
    })
    .sort((a, b) => a.year - b.year);
  // Moyennes sur les années où le foyer est complet, pour ne pas compter l'arrivée d'un membre comme une hausse.
  const complete = totals.filter((t) => t.complete);
  const first = complete[0];
  const last = complete.at(-1);
  const span = first && last ? last.year - first.year : 0;
  const withMarket = complete.filter((t) => t.marketMedianMonthlyRp !== null);
  const mFirst = withMarket[0];
  const mLast = withMarket.at(-1);
  const lastKnown = totals.at(-1);
  return {
    totalPaidRp,
    ritualSavings,
    avgChangePermille: first && last ? cagrPermille(first.billedMonthlyRp, last.billedMonthlyRp, span) : null,
    avgMarketChangePermille: mFirst && mLast ? cagrPermille(mFirst.marketMedianMonthlyRp!, mLast.marketMedianMonthlyRp!, mLast.year - mFirst.year) : null,
    gapToCheapestAnnualRp: lastKnown?.marketMinMonthlyRp != null ? Math.max(0, (lastKnown.billedMonthlyRp - lastKnown.marketMinMonthlyRp) * 12) : null,
  };
}
