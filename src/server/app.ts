import "server-only";
import { createContext, systemClock, type AppContext } from "@/application/context";
import { dataDir, getDb } from "@/infrastructure/db/client";
import { diskFileStore } from "@/infrastructure/files";
import { INSURER_SEED } from "./insurer-seed";

const globalForApp = globalThis as unknown as { __lamalApp?: AppContext };

/** Racine de composition : contexte applicatif partagé par les pages, actions et routes. */
export function app(): AppContext {
  if (!globalForApp.__lamalApp) {
    const ctx = createContext(getDb(), systemClock, diskFileStore(dataDir()));
    ctx.reference.seedInsurers(INSURER_SEED);
    globalForApp.__lamalApp = ctx;
  }
  return globalForApp.__lamalApp;
}
