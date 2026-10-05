import { desc, eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { insurer, lamalParameters, tariffDataset } from "@/infrastructure/db/schema";
import { officialCo2 } from "@/infrastructure/reference/apply";
import { activeDataset, parametersFor } from "@/infrastructure/db/queries";
import { getSetting, SETTING_KEYS } from "@/infrastructure/db/settings";
import type { LamalParameters } from "@/domain/parameters";
import { requireAdmin, type Scope } from "./scope";

/*
 * Référentiel partagé par tous les foyers (jeux de primes OFSP, paramètres légaux, caisses) :
 * consultation libre, modification réservée à l'administrateur.
 */

/** Résultat de la dernière mise à jour en ligne du référentiel (server/reference.ts). */
export interface ReferenceCheck {
  at: string;
  /** Date de l'annuaire des caisses appliqué. */
  directory: string | null;
  results: string[];
  ok: boolean;
}

/** Primes officielles de l'année importées (jeu actif) ? C'est la condition pour ouvrir le bilan. */
export function premiumsAvailable(db: Db, year: number): boolean {
  return activeDataset(db, year) !== undefined;
}

/** Paramètres légaux de l'année (franchises, quote-part, CO2), avec repli sur la loi en vigueur. */
export function legalParameters(db: Db, year: number): LamalParameters {
  return parametersFor(db, year);
}

/** Derniers contrôles automatiques : primes OFSP et référentiel (Réglages). */
export function lastDataChecks(db: Db) {
  return {
    premiums: getSetting<{ at: string; ok: boolean }>(db, SETTING_KEYS.ofspLastCheck),
    reference: getSetting<ReferenceCheck>(db, SETTING_KEYS.referenceLastCheck),
  };
}

/** Jeux de primes importés (actifs, remplacés, en échec), le plus récent d'abord. */
export function listDatasets(db: Db) {
  return db.select().from(tariffDataset).orderBy(desc(tariffDataset.id)).all();
}

/** Paramètres légaux enregistrés, de l'année la plus récente à la plus ancienne. */
export function listParameters(db: Db) {
  return db.select().from(lamalParameters).orderBy(desc(lamalParameters.year)).all();
}

/**
 * Montant annuel de la redistribution CO2 saisi à la main (null : montant inconnu). La saisie reste
 * prioritaire sur le montant officiel jusqu'à `resetCo2`.
 */
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

/** Efface l'adresse de résiliation saisie : les lettres reprennent celle de l'annuaire officiel. */
export function resetInsurerAddress(db: Db, scope: Scope, insurerId: number) {
  requireAdmin(scope);
  db.update(insurer).set({ terminationAddress: null, addressVerifiedAt: null }).where(eq(insurer.id, insurerId)).run();
}
