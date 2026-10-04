import { desc, eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { insurer, lamalParameters, tariffDataset } from "@/infrastructure/db/schema";
import { officialCo2 } from "@/infrastructure/reference/apply";
import { requireAdmin, type Scope } from "./scope";

/*
 * Référentiel partagé par tous les foyers (jeux de primes OFSP, paramètres légaux, caisses) :
 * consultation libre, modification réservée à l'administrateur.
 */

export function listDatasets(db: Db) {
  return db.select().from(tariffDataset).orderBy(desc(tariffDataset.id)).all();
}

export function listParameters(db: Db) {
  return db.select().from(lamalParameters).orderBy(desc(lamalParameters.year)).all();
}

/** Montant annuel de la redistribution CO2 saisi à la main ; null efface la saisie. */
export function saveCo2(db: Db, scope: Scope, year: number, amountRp: number | null) {
  requireAdmin(scope);
  db.update(lamalParameters).set({ co2AnnualRp: amountRp, co2Source: "USER", sourceNote: "Saisi manuellement" }).where(eq(lamalParameters.year, year)).run();
}

/** Abandonne la saisie : le montant officiel (OFEV) reprend la main et suivra ses mises à jour. */
export function resetCo2(db: Db, scope: Scope, year: number) {
  requireAdmin(scope);
  db.update(lamalParameters)
    .set({ co2AnnualRp: officialCo2(year), co2Source: "OFFICIAL", sourceNote: "Office fédéral de l'environnement (OFEV)" })
    .where(eq(lamalParameters.year, year))
    .run();
}

export function resetInsurerAddress(db: Db, scope: Scope, insurerId: number) {
  requireAdmin(scope);
  db.update(insurer).set({ terminationAddress: null, addressVerifiedAt: null }).where(eq(insurer.id, insurerId)).run();
}
