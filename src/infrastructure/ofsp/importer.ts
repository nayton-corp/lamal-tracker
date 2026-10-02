import { and, eq, inArray, ne } from "drizzle-orm";
import { mapHeader, normalizeRow, type Column, type PremiumRow } from "@/domain/ofsp/normalize";
import { ImportAccumulator, type ValidationReport } from "@/domain/ofsp/report";
import { defaultParameters } from "@/domain/parameters";
import type { Db } from "../db/client";
import { insurer, lamalParameters, premium, tariff, tariffDataset } from "../db/schema";
import { insurerName } from "./insurers";
import { readRows } from "./reader";
import { sha256File } from "./source";

export type ImportOutcome =
  | { status: "IMPORTED"; datasetId: number; report: ValidationReport }
  | { status: "ALREADY"; datasetId: number; year: number | null }
  | { status: "FAILED"; datasetId: number; report: ValidationReport };

export interface ImportOptions {
  /** Restreint l'import à certains cantons (économise de la place sur le Pi). Vide = tous. */
  cantons?: string[];
  onProgress?: (rowsRead: number) => void;
}

const BATCH = 2000;

/**
 * Importe un fichier de primes OFSP comme nouveau jeu immuable.
 * Idempotent par empreinte : le même fichier n'est jamais importé deux fois.
 * Écrit par lots (le serveur reste réactif) ; le jeu reste IMPORTING jusqu'à la validation,
 * puis devient ACTIVE (et remplace l'éventuel jeu actif de la même année) ou FAILED.
 */
export async function importPremiumFile(
  db: Db,
  file: string,
  source: string,
  opts: ImportOptions = {},
): Promise<ImportOutcome> {
  const sha = await sha256File(file);
  const existing = db
    .select()
    .from(tariffDataset)
    .where(and(eq(tariffDataset.fileSha256, sha), inArray(tariffDataset.status, ["ACTIVE", "SUPERSEDED"])))
    .get();
  if (existing) return { status: "ALREADY", datasetId: existing.id, year: existing.year };

  const dataset = db
    .insert(tariffDataset)
    .values({ source, fileSha256: sha, status: "IMPORTING" })
    .returning()
    .get();

  const acc = new ImportAccumulator();
  const cantonFilter = opts.cantons?.length ? new Set(opts.cantons) : null;
  const insurerIds = new Map<number, number>(
    db.select({ id: insurer.id, bag: insurer.bagNumber }).from(insurer).all().map((r) => [r.bag, r.id]),
  );
  const tariffIds = new Map<string, number>();

  const insertInsurer = db.$client.prepare(
    "INSERT INTO insurer (bag_number, name) VALUES (?, ?) ON CONFLICT(bag_number) DO UPDATE SET name = name RETURNING id",
  );
  const insertTariff = db.$client.prepare(
    "INSERT INTO tariff (dataset_id, insurer_id, code, label, type_raw, model_type) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
  );
  const insertPremium = db.$client.prepare(
    `INSERT OR IGNORE INTO premium (dataset_id, tariff_id, canton, region, age_class, subgroup, accident, franchise_chf, monthly_rp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const writeBatch = db.$client.transaction((rows: PremiumRow[]) => {
    for (const r of rows) {
      let insurerId = insurerIds.get(r.insurerBag);
      if (insurerId === undefined) {
        insurerId = (insertInsurer.get(r.insurerBag, insurerName(r.insurerBag)) as { id: number }).id;
        insurerIds.set(r.insurerBag, insurerId);
      }
      const tKey = `${insurerId}|${r.tariffCode}`;
      let tariffId = tariffIds.get(tKey);
      if (tariffId === undefined) {
        tariffId = (insertTariff.get(dataset.id, insurerId, r.tariffCode, r.tariffLabel, r.tariffTypeRaw, r.modelType) as { id: number }).id;
        tariffIds.set(tKey, tariffId);
      }
      const res = insertPremium.run(
        dataset.id, tariffId, r.canton, r.region, r.ageClass, r.subgroup, r.accident ? 1 : 0, r.franchiseChf, r.monthlyPremiumRp,
      );
      if (res.changes === 0) acc.duplicate();
      else acc.keep(r);
    }
  });

  let index: Partial<Record<Column, number>> | null = null;
  let missing: string[] = [];
  let batch: PremiumRow[] = [];
  let filtered = 0;

  try {
    for await (const cells of readRows(file)) {
      if (index === null) {
        if (cells.every((c) => c === undefined || c === null || String(c).trim() === "")) continue;
        const header = mapHeader(cells);
        index = header.index;
        missing = header.missing;
        if (missing.length) break;
        continue;
      }
      const result = normalizeRow(cells, index);
      if (!result.ok) {
        acc.skip(result.reason);
        continue;
      }
      if (cantonFilter && !cantonFilter.has(result.row.canton)) {
        filtered++;
        continue;
      }
      batch.push(result.row);
      if (batch.length >= BATCH) {
        writeBatch(batch);
        batch = [];
        opts.onProgress?.(acc.rowsRead + filtered);
        await new Promise((r) => setImmediate(r));
      }
    }
    if (batch.length) writeBatch(batch);
  } catch (error) {
    const report = acc.report(missing);
    report.ok = false;
    report.errors.push(`Lecture impossible : ${error instanceof Error ? error.message : String(error)}`);
    return fail(db, dataset.id, report);
  }

  if (index === null) missing = ["(en-tête introuvable)"];
  const draft = acc.report(missing);
  const previous = draft.year === null ? undefined : previousMedians(db, draft.year - 1);
  const report = acc.report(missing, previous);
  if (filtered) report.warnings.push(`${filtered} lignes hors des cantons retenus (${[...cantonFilter!].join(", ")}) ignorées.`);

  if (!report.ok || report.year === null) return fail(db, dataset.id, report);

  db.transaction((tx) => {
    tx.update(tariffDataset)
      .set({ status: "SUPERSEDED" })
      .where(and(eq(tariffDataset.year, report.year!), eq(tariffDataset.status, "ACTIVE"), ne(tariffDataset.id, dataset.id)))
      .run();
    tx.update(tariffDataset).set({ status: "ACTIVE", year: report.year, report }).where(eq(tariffDataset.id, dataset.id)).run();
    const p = defaultParameters(report.year!);
    tx.insert(lamalParameters)
      .values({
        year: p.year,
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
  });
  return { status: "IMPORTED", datasetId: dataset.id, report };
}

function fail(db: Db, datasetId: number, report: ValidationReport): ImportOutcome {
  db.transaction((tx) => {
    tx.delete(premium).where(eq(premium.datasetId, datasetId)).run();
    tx.delete(tariff).where(eq(tariff.datasetId, datasetId)).run();
    tx.update(tariffDataset).set({ status: "FAILED", year: report.year, report }).where(eq(tariffDataset.id, datasetId)).run();
  });
  return { status: "FAILED", datasetId, report };
}

function previousMedians(db: Db, year: number): Record<string, number> | undefined {
  const prev = db
    .select({ report: tariffDataset.report })
    .from(tariffDataset)
    .where(and(eq(tariffDataset.year, year), eq(tariffDataset.status, "ACTIVE")))
    .get();
  return (prev?.report as ValidationReport | undefined)?.stats.adultMedianByCanton;
}
