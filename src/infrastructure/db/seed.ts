import { defaultParameters } from "@/domain/parameters";
import type { Db } from "./client";
import { and, eq, isNull } from "drizzle-orm";
import { insurer, lamalParameters } from "./schema";
import { KNOWN_INSURERS, SHORT_NAMES } from "../ofsp/insurers";
import { applyCo2, applyDirectory, applySupervisory, officialCo2, officialCo2Table } from "../reference/apply";
import insurersData from "../reference/data/insurers.json";
import supervisoryData from "../reference/data/supervisory.json";
import type { DirectoryEntry } from "../reference/insurer-directory";
import type { SupervisoryRow } from "../reference/supervisory";
import { getSetting, setSetting, SETTING_KEYS } from "./settings";

/*
 * Référentiel de départ, appliqué à chaque ouverture de la base : caisses connues, paramètres
 * légaux des années récentes, données officielles embarquées dans l'image (annuaire, surveillance, CO2).
 */

type SupervisoryTuple = [number, number, number, number, number | null, number | null, number | null];

/** Données de surveillance embarquées (tableau compact) sous forme d'objets. */
export function bundledSupervisory(): SupervisoryRow[] {
  return (supervisoryData.rows as SupervisoryTuple[]).map(([bagNumber, year, insured, premiumPerInsuredRp, benefitsPerInsuredRp, adminPerInsuredRp, reservesPerInsuredRp]) => ({
    bagNumber, year, insured, premiumPerInsuredRp, benefitsPerInsuredRp, adminPerInsuredRp, reservesPerInsuredRp,
  }));
}

/**
 * Référentiel : assureurs connus, coordonnées officielles, indicateurs, paramètres des années
 * récentes. Idempotent ; les référentiels embarqués ne sont réappliqués que s'ils ont changé
 * depuis le dernier démarrage (le Pi peut entre-temps avoir téléchargé plus récent).
 */
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
      const p = defaultParameters(y, officialCo2(y));
      tx.insert(lamalParameters)
        .values({
          year: y,
          franchisesAdult: p.franchisesAdult,
          franchisesKid: p.franchisesKid,
          coinsuranceRateBp: p.coinsuranceRateBp,
          coinsuranceMaxAdultRp: p.coinsuranceMaxAdultRp,
          coinsuranceMaxKidRp: p.coinsuranceMaxKidRp,
          co2AnnualRp: p.co2AnnualRp,
          sourceNote: p.co2AnnualRp === null ? "Pas encore publiée" : "Office fédéral de l'environnement (OFEV)",
        })
        .onConflictDoNothing()
        .run();
    }
  });

  const bundled = `${insurersData.validFrom}|${supervisoryData.source}|${supervisoryData.rows.length}|${JSON.stringify([...officialCo2Table()])}`;
  if (getSetting<string>(db, SETTING_KEYS.referenceBundled) === bundled) return;
  const local = getSetting<{ directory?: string | null }>(db, SETTING_KEYS.referenceLocal);
  // Un annuaire plus récent téléchargé par le Pi n'est pas remplacé par l'embarqué.
  if (!local?.directory || (insurersData.validFrom ?? "") >= local.directory) {
    applyDirectory(db, { validFrom: insurersData.validFrom, entries: insurersData.entries as DirectoryEntry[] });
  }
  applySupervisory(db, bundledSupervisory());
  applyCo2(db, officialCo2Table());
  setSetting(db, SETTING_KEYS.referenceBundled, bundled);
}
