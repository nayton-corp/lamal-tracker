import "server-only";
import { getDb } from "@/infrastructure/db/client";
import type { IsoDate } from "@/domain/dates";

export const TIME_ZONE = "Europe/Zurich";

export function db() {
  return getDb();
}

/** Date civile du jour à Zurich (le domaine ne lit jamais l'horloge lui-même). */
export function today(): IsoDate {
  if (process.env.FAKE_TODAY) return process.env.FAKE_TODAY;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Année visée par le rituel d'automne : toujours l'année prochaine. */
export function ritualYear(): number {
  return Number(today().slice(0, 4)) + 1;
}
