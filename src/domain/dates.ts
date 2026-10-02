/** Dates civiles en ISO « AAAA-MM-JJ », sans fuseau : le domaine ne lit jamais l'horloge. */
export type IsoDate = string;

function toUtc(d: IsoDate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, day ?? 1));
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, days: number): IsoDate {
  const date = toUtc(d);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function isWeekend(d: IsoDate): boolean {
  const day = toUtc(d).getUTCDay();
  return day === 0 || day === 6;
}

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export function formatDateLong(d: IsoDate, withWeekday = false): string {
  const date = toUtc(d);
  const base = `${date.getUTCDate()}${date.getUTCDate() === 1 ? "er" : ""} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return withWeekday ? `${WEEKDAYS[date.getUTCDay()]} ${base}` : base;
}

export function formatDateShort(d: IsoDate): string {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}
