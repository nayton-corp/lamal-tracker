import "server-only";
import { createContext, fixedClock, systemClock, type AppContext } from "@/application/context";
import { isIsoDate } from "@/domain/calendar";
import { dataDir, getDb } from "@/infrastructure/db/client";
import { diskFileStore } from "@/infrastructure/files";
import { INSURER_SEED } from "./insurer-seed";

const globalForApp = globalThis as unknown as { __lamalApp?: AppContext };

/** Racine de composition : contexte applicatif partagé par les pages, actions et routes. */
export function app(): AppContext {
  if (!globalForApp.__lamalApp) {
    // LAMAL_TODAY fige la date (tests de bout en bout, démonstration) ; jamais défini en production.
    const today = process.env.LAMAL_TODAY;
    const clock = today && isIsoDate(today) ? fixedClock(today) : systemClock;
    const ctx = createContext(getDb(), clock, diskFileStore(dataDir()));
    ctx.reference.seedInsurers(INSURER_SEED);
    globalForApp.__lamalApp = ctx;
  }
  return globalForApp.__lamalApp;
}
