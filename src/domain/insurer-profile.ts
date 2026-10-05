import type { Rappen } from "./money";

/**
 * Portrait d'une caisse pour le comparateur, à partir de données publiques : sa taille, ses
 * réserves et ses frais administratifs (données de surveillance OFSP), et l'évolution de ses
 * primes dans la région de l'assuré (primes OFSP des années passées).
 */
export interface InsurerFigures {
  insurerId: number;
  year: number;
  insured: number;
  premiumPerInsuredRp: Rappen;
  adminPerInsuredRp: Rappen | null;
  reservesPerInsuredRp: Rappen | null;
}

export type TercileLevel = "LOW" | "MID" | "HIGH";
export type TrendLevel = "BETTER" | "SIMILAR" | "WORSE";

export interface InsurerProfile {
  /** Année des comptes (données de surveillance). */
  year: number | null;
  insured: number | null;
  /** Réserves exprimées en mois de primes (1 décimale). */
  reservesMonths: number | null;
  reservesLevel: TercileLevel | null;
  adminPerInsuredRp: Rappen | null;
  adminLevel: TercileLevel | null;
  trend: PremiumTrend | null;
  trendLevel: TrendLevel | null;
}

export interface PremiumTrend {
  fromYear: number;
  toYear: number;
  /** Hausse annuelle moyenne de la caisse, en pour mille. */
  insurerPermille: number;
  /** Hausse annuelle moyenne du marché (médiane des caisses), en pour mille. */
  marketPermille: number;
}

/** Hausse annuelle moyenne (composée) entre la première et la dernière année, en pour mille. */
export function annualGrowthPermille(series: ReadonlyMap<number, Rappen>): { fromYear: number; toYear: number; permille: number } | null {
  const years = [...series.keys()].sort((a, b) => a - b);
  if (years.length < 2) return null;
  const fromYear = years[0]!;
  const toYear = years.at(-1)!;
  const first = series.get(fromYear)!;
  const last = series.get(toYear)!;
  if (first <= 0 || last <= 0) return null;
  const rate = Math.pow(last / first, 1 / (toYear - fromYear)) - 1;
  return { fromYear, toYear, permille: Math.round(rate * 1000) };
}

/** Tiers (bas, moyen, haut) d'une valeur parmi celles du marché. */
export function tercile(value: number, values: readonly number[]): TercileLevel {
  const sorted = [...values].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  const share = sorted.length ? below / sorted.length : 0.5;
  return share < 1 / 3 ? "LOW" : share < 2 / 3 ? "MID" : "HIGH";
}

/** Médiane arrondie à l'entier ; null si la liste est vide. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** Écart (en pour mille par an) au-delà duquel une caisse augmente plus ou moins que le marché. */
const TREND_TOLERANCE = 10;

/**
 * Portraits de toutes les caisses. `figures` : comptes de la dernière année publiée ;
 * `series` : prime de référence par caisse et par année (même profil, même franchise).
 */
export function buildProfiles(
  figures: readonly InsurerFigures[],
  series: ReadonlyMap<number, ReadonlyMap<number, Rappen>>,
): Map<number, InsurerProfile> {
  const reserveMonths = (f: InsurerFigures) =>
    f.reservesPerInsuredRp === null || f.premiumPerInsuredRp <= 0 ? null : Math.round((f.reservesPerInsuredRp / f.premiumPerInsuredRp) * 120) / 10;
  const allReserves = figures.map(reserveMonths).filter((v): v is number => v !== null);
  const allAdmin = figures.map((f) => f.adminPerInsuredRp).filter((v): v is number => v !== null);

  // Marché : prime médiane des caisses, chaque année.
  const byYear = new Map<number, number[]>();
  for (const s of series.values()) for (const [y, rp] of s) byYear.set(y, [...(byYear.get(y) ?? []), rp]);
  const marketSeries = new Map([...byYear].map(([y, v]) => [y, median(v)!] as const));

  const ids = new Set([...figures.map((f) => f.insurerId), ...series.keys()]);
  const out = new Map<number, InsurerProfile>();
  for (const id of ids) {
    const f = figures.find((x) => x.insurerId === id) ?? null;
    const months = f ? reserveMonths(f) : null;
    const own = series.get(id);
    const growth = own ? annualGrowthPermille(own) : null;
    let trend: PremiumTrend | null = null;
    if (growth) {
      const market = annualGrowthPermille(new Map([...marketSeries].filter(([y]) => y >= growth.fromYear && y <= growth.toYear)));
      if (market) trend = { fromYear: growth.fromYear, toYear: growth.toYear, insurerPermille: growth.permille, marketPermille: market.permille };
    }
    const diff = trend ? trend.insurerPermille - trend.marketPermille : null;
    out.set(id, {
      year: f?.year ?? null,
      insured: f?.insured ?? null,
      reservesMonths: months,
      reservesLevel: months === null ? null : tercile(months, allReserves),
      adminPerInsuredRp: f?.adminPerInsuredRp ?? null,
      adminLevel: f?.adminPerInsuredRp == null ? null : tercile(f.adminPerInsuredRp, allAdmin),
      trend,
      trendLevel: diff === null ? null : diff > TREND_TOLERANCE ? "WORSE" : diff < -TREND_TOLERANCE ? "BETTER" : "SIMILAR",
    });
  }
  return out;
}
