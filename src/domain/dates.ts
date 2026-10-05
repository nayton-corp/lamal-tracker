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

/** Fuseau dans lequel les instants sont affichés (l'app ne sert que la Suisse). */
export const DISPLAY_TIME_ZONE = "Europe/Zurich";

const TIMESTAMP_STYLES = {
  /** « 5 oct. 2026 » */
  date: { day: "numeric", month: "short", year: "numeric" },
  /** « 5 octobre 2026 » */
  dateLong: { day: "numeric", month: "long", year: "numeric" },
  /** « 05.10.26 14:30 » */
  dateTime: { dateStyle: "short", timeStyle: "short" },
  /** « 5 octobre 2026 à 14:30 » */
  dateTimeLong: { dateStyle: "long", timeStyle: "short" },
  /** « 14:30 » */
  time: { hour: "2-digit", minute: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type TimestampStyle = keyof typeof TIMESTAMP_STYLES;

/**
 * Affiche un instant (ISO 8601 avec heure, ex. `createdAt`) à l'heure suisse.
 * Pour une date civile sans heure (`IsoDate`), utiliser `formatDateLong` ou `formatDateShort`.
 */
export function formatTimestamp(iso: string | Date, style: TimestampStyle): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString("fr-CH", { timeZone: DISPLAY_TIME_ZONE, ...TIMESTAMP_STYLES[style] });
}
