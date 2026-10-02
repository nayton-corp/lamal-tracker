import type { IsoDate } from "@/domain/calendar";
import type { Db } from "@/infrastructure/db/client";
import { HouseholdRepository } from "@/infrastructure/db/household-repository";
import { ReferenceRepository } from "@/infrastructure/db/reference-repository";
import { ReviewRepository } from "@/infrastructure/db/review-repository";
import { SystemRepository } from "@/infrastructure/db/system-repository";
import { TariffRepository } from "@/infrastructure/db/tariff-repository";

export interface Clock {
  /** Date du jour en Suisse (Europe/Zurich). */
  today(): IsoDate;
  nowIso(): string;
}

export interface FileStore {
  write(relativePath: string, bytes: Uint8Array): string;
  read(relativePath: string): Uint8Array;
  exists(relativePath: string): boolean;
  remove(relativePath: string): void;
}

export interface AppContext {
  db: Db;
  tariffs: TariffRepository;
  reference: ReferenceRepository;
  household: HouseholdRepository;
  reviews: ReviewRepository;
  system: SystemRepository;
  clock: Clock;
  files: FileStore;
}

export function createContext(db: Db, clock: Clock, files: FileStore): AppContext {
  return {
    db,
    tariffs: new TariffRepository(db),
    reference: new ReferenceRepository(db),
    household: new HouseholdRepository(db),
    reviews: new ReviewRepository(db),
    system: new SystemRepository(db),
    clock,
    files,
  };
}

/** Horloge réelle, au fuseau de Zurich (la date du jour ne bascule pas à 01:00/02:00 UTC). */
export const systemClock: Clock = {
  today() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Zurich",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return parts;
  },
  nowIso() {
    return new Date().toISOString();
  },
};

export function fixedClock(today: IsoDate, time = "10:00:00.000Z"): Clock {
  return { today: () => today, nowIso: () => `${today}T${time}` };
}
