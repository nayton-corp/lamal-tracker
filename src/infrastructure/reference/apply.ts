import { and, eq, ne, or, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { insurer, insurerIndicator, lamalParameters } from "../db/schema";
import co2Data from "./data/co2.json";
import type { DirectoryEntry } from "./insurer-directory";
import type { SupervisoryRow } from "./supervisory";

/*
 * Écriture en base des référentiels officiels (annuaire des caisses, données de surveillance, CO2),
 * qu'ils viennent de l'image (seed.ts) ou d'une mise à jour en ligne (server/reference.ts). Ce que
 * l'utilisateur a saisi n'est jamais écrasé.
 */

/** Redistribution CO2 officielle d'une année (référentiel embarqué), en centimes par personne et par an. */
export function officialCo2(year: number): number | null {
  return (co2Data.amountsRp as Record<string, number>)[String(year)] ?? null;
}

/** Tous les montants CO2 embarqués, par année (centimes par personne et par an). */
export function officialCo2Table(): Map<number, number> {
  return new Map(Object.entries(co2Data.amountsRp as Record<string, number>).map(([y, rp]) => [Number(y), rp]));
}

/**
 * Coordonnées officielles des caisses. N'écrase jamais ce que l'utilisateur a saisi : l'adresse
 * de résiliation personnelle reste dans `terminationAddress`, le site seulement s'il est vide.
 */
export function applyDirectory(db: Db, dir: { validFrom: string | null; entries: readonly DirectoryEntry[] }): number {
  let changed = 0;
  db.transaction((tx) => {
    for (const e of dir.entries) {
      const official = {
        legalNameFr: e.legalNameFr || null,
        officialAddress: e.address.length ? e.address.join("\n") : null,
        email: e.email,
        phone: e.phone,
        groupName: e.group,
        directoryDate: dir.validFrom,
      };
      const row = tx.select().from(insurer).where(eq(insurer.bagNumber, e.bagNumber)).get();
      if (!row) {
        tx.insert(insurer).values({ bagNumber: e.bagNumber, name: e.legalNames[0] ?? e.legalNameFr, website: e.website, ...official }).run();
        changed++;
        continue;
      }
      const same = (Object.keys(official) as (keyof typeof official)[]).every((k) => row[k] === official[k]) && (row.website || !e.website);
      if (same) continue;
      tx.update(insurer)
        .set({ ...official, website: row.website || e.website })
        .where(eq(insurer.id, row.id))
        .run();
      changed++;
    }
  });
  return changed;
}

/** Enregistre (ou remplace) les indicateurs par caisse et par année ; renvoie le nombre de lignes. */
export function applySupervisory(db: Db, rows: readonly SupervisoryRow[]): number {
  db.transaction((tx) => {
    for (const r of rows) {
      tx.insert(insurerIndicator)
        .values(r)
        .onConflictDoUpdate({ target: [insurerIndicator.bagNumber, insurerIndicator.year], set: { ...r } })
        .run();
    }
  });
  return rows.length;
}

/** Met à jour les montants CO2 d'origine officielle ; une saisie de l'utilisateur est conservée. */
export function applyCo2(db: Db, amounts: ReadonlyMap<number, number>): number {
  let changed = 0;
  for (const [year, rp] of amounts) {
    const res = db
      .update(lamalParameters)
      .set({ co2AnnualRp: rp, sourceNote: "Office fédéral de l'environnement (OFEV)" })
      .where(
        and(
          eq(lamalParameters.year, year),
          eq(lamalParameters.co2Source, "OFFICIAL"),
          or(isNull(lamalParameters.co2AnnualRp), ne(lamalParameters.co2AnnualRp, rp)),
        ),
      )
      .run();
    changed += res.changes;
  }
  return changed;
}
