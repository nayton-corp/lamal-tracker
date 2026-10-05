import "server-only";
import { getDb } from "@/infrastructure/db/client";
import { DISPLAY_TIME_ZONE, type IsoDate } from "@/domain/dates";

/**
 * Accès du serveur à ce qui vient de l'extérieur du domaine : la base et l'horloge.
 * Le domaine ne lit jamais l'heure lui-même ; on lui passe `today()` ou `nowIso()`.
 */

export function db() {
  return getDb();
}

/** Date civile du jour à Zurich. `FAKE_TODAY=AAAA-MM-JJ` la fige (tests, démonstrations). */
export function today(): IsoDate {
  if (process.env.FAKE_TODAY) return process.env.FAKE_TODAY;
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Instant présent en ISO 8601 (UTC), pour les colonnes `*At`. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Année civile en cours à Zurich. */
export function currentYear(): number {
  return Number(today().slice(0, 4));
}

/** Année visée par le rituel d'automne : toujours l'année prochaine. */
export function ritualYear(): number {
  return currentYear() + 1;
}
