import { asc, eq } from "drizzle-orm";
import { ageClassForYear } from "@/domain/age";
import { marketStats } from "@/domain/comparison";
import { defaultSubgroup } from "@/domain/lamal";
import { changePermille } from "@/domain/money";
import type { Db } from "@/infrastructure/db/client";
import { activeDataset, insurerLabel, offersFor, parametersFor } from "@/infrastructure/db/queries";
import { insurer, lamalPolicy, person } from "@/infrastructure/db/schema";
import { getHousehold } from "./household";

export interface HistoryPoint {
  year: number;
  insurer: string;
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

export interface HouseholdHistory {
  years: number[];
  persons: PersonHistory[];
  totals: { year: number; billedMonthlyRp: number; netMonthlyRp: number; changePermille: number | null; complete: boolean }[];
}

/** Historique pluriannuel : primes réellement facturées, nettes de CO2, et repères de marché. */
export function householdHistory(db: Db): HouseholdHistory {
  const h = getHousehold(db);
  if (!h) return { years: [], persons: [], totals: [] };
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
  const totals = sortedYears.map((year) => {
    const pts = result.map((r) => r.points.find((pt) => pt.year === year));
    const billed = pts.reduce((a, pt) => a + (pt?.billedMonthlyRp ?? 0), 0);
    const net = pts.reduce((a, pt) => a + (pt?.netMonthlyRp ?? 0), 0);
    const t = { year, billedMonthlyRp: billed, netMonthlyRp: net, changePermille: prevTotal === null ? null : changePermille(prevTotal, billed), complete: pts.every(Boolean) };
    prevTotal = billed;
    return t;
  });
  return { years: sortedYears, persons: result, totals };
}
