/**
 * Dates civiles « AAAA-MM-JJ » sans fuseau. Toute la logique métier travaille sur ces chaînes ;
 * l'heure courante est toujours injectée (jamais de Date.now() dans le domaine).
 */
export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: IsoDate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(value);
  if (!m) throw new Error(`Date invalide : « ${value} » (format attendu AAAA-MM-JJ)`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error(`Date inexistante : « ${value} »`);
  }
  return { year, month, day };
}

export function isIsoDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

function toUtc(value: IsoDate): Date {
  const { year, month, day } = parseIsoDate(value);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function isoDate(year: number, month: number, day: number): IsoDate {
  return fromUtc(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = toUtc(value);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Nombre de jours de `from` à `to` (positif si `to` est après). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** 0 = dimanche … 6 = samedi */
export function weekday(value: IsoDate): number {
  return toUtc(value).getUTCDay();
}

export function isWeekend(value: IsoDate): boolean {
  const d = weekday(value);
  return d === 0 || d === 6;
}

/** Dernier jour ouvrable (lundi–vendredi) au plus tard le jour donné. */
export function lastWorkingDayOnOrBefore(value: IsoDate): IsoDate {
  let d = value;
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

/** Recule de `n` jours ouvrables (lundi–vendredi). */
export function subtractWorkingDays(value: IsoDate, n: number): IsoDate {
  let d = value;
  let remaining = n;
  while (remaining > 0) {
    d = addDays(d, -1);
    if (!isWeekend(d)) remaining -= 1;
  }
  return d;
}

export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const WEEKDAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** « 30 novembre 2026 », ou « lundi 30 novembre 2026 » avec le jour. */
export function formatDateFr(value: IsoDate, withWeekday = false): string {
  const { year, month, day } = parseIsoDate(value);
  const base = `${day === 1 ? "1er" : day} ${MONTHS_FR[month - 1]} ${year}`;
  return withWeekday ? `${WEEKDAYS_FR[weekday(value)]} ${base}` : base;
}

/** « 30.11.2026 » */
export function formatDateShort(value: IsoDate): string {
  const { year, month, day } = parseIsoDate(value);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

export function yearOf(value: IsoDate): number {
  return parseIsoDate(value).year;
}
