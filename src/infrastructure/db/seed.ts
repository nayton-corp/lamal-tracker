import { defaultParameters } from "@/domain/parameters";
import type { Db } from "./client";
import { and, eq, isNull } from "drizzle-orm";
import { insurer, lamalParameters } from "./schema";
import { KNOWN_INSURERS, SHORT_NAMES } from "../ofsp/insurers";

/** Référentiel minimal : assureurs connus et paramètres des années récentes. Idempotent. */
export function seedReference(db: Db, currentYear: number) {
  db.transaction((tx) => {
    for (const [bag, name] of Object.entries(KNOWN_INSURERS)) {
      tx.insert(insurer).values({ bagNumber: Number(bag), name }).onConflictDoNothing().run();
    }
    // Nom usuel par défaut, sans écraser un nom choisi par l'utilisateur.
    for (const [bag, short] of Object.entries(SHORT_NAMES)) {
      tx.update(insurer).set({ displayName: short }).where(and(eq(insurer.bagNumber, Number(bag)), isNull(insurer.displayName))).run();
    }
    for (let y = currentYear - 2; y <= currentYear + 1; y++) {
      const p = defaultParameters(y);
      tx.insert(lamalParameters)
        .values({
          year: y,
          franchisesAdult: p.franchisesAdult,
          franchisesKid: p.franchisesKid,
          coinsuranceRateBp: p.coinsuranceRateBp,
          coinsuranceMaxAdultRp: p.coinsuranceMaxAdultRp,
          coinsuranceMaxKidRp: p.coinsuranceMaxKidRp,
          co2AnnualRp: p.co2AnnualRp,
          sourceNote: p.co2AnnualRp === null ? "Redistribution CO2 à saisir" : "Valeurs par défaut connues",
        })
        .onConflictDoNothing()
        .run();
    }
  });
}
