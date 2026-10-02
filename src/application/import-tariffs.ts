import { createHash } from "node:crypto";
import { marketStats } from "@/domain/comparison/rank";
import { relativeChangeBp } from "@/domain/money";
import { CANTONS } from "@/domain/tariff";
import { PARSER_VERSION } from "@/infrastructure/ofsp/normalize";
import { parseTariffRows, prepareTariffFile, TariffFileError, yearFromFileName, type PreparedFile } from "@/infrastructure/ofsp/parser";
import type { TariffInsert } from "@/infrastructure/db/tariff-repository";
import type { AppContext } from "./context";

export interface ValidationReport {
  year: number;
  csvName: string;
  encoding: string;
  delimiter: string;
  unknownColumns: string[];
  rowsRead: number;
  rowsImported: number;
  rowsRejected: number;
  duplicates: number;
  errorCounts: Record<string, number>;
  errorExamples: { line: number; message: string }[];
  byCanton: Record<string, number>;
  missingCantons: string[];
  insurerCount: number;
  insurersWithoutStandard: number[];
  byModel: Record<string, number>;
  subgroups: { ageClass: string; subgroup: string; n: number }[];
  outOfBoundsCount: number;
  outOfBoundsExamples: { insurerId: number; canton: string; ageClass: string; franchise: number; premium: number }[];
  yearOverYear: {
    previousYear: number;
    comparedProducts: number;
    medianChangeBp: number | null;
    medianChangeBpByCanton: Record<string, number>;
    bigChangeCount: number;
    bigChanges: { insurerId: number; tariffCode: string; canton: string; region: number; fromRp: number; toRp: number; changeBp: number }[];
  } | null;
  /** Problèmes qui empêchent l'activation. */
  blocking: string[];
  warnings: string[];
}

export class ImportError extends Error {}

export interface ImportResult {
  datasetId: number;
  duplicateOf: number | null;
  report: ValidationReport;
}

/** Changement relatif au-delà duquel un produit est signalé (±30 %). */
const BIG_CHANGE_BP = 3000;

/**
 * Importe un fichier de primes OFSP en « staging ». Idempotent : un fichier déjà importé
 * (même empreinte sha256) n'est pas réimporté. L'activation reste une décision explicite.
 */
export function importTariffFile(
  ctx: AppContext,
  input: { fileName: string; bytes: Uint8Array; sourceLabel: string; sourceUrl: string | null; yearHint?: number | null },
): ImportResult {
  const sha = createHash("sha256").update(input.bytes).digest("hex");
  const existing = ctx.tariffs.findDatasetBySha(sha);
  if (existing && existing.status !== "DISCARDED") {
    return { datasetId: existing.id, duplicateOf: existing.id, report: existing.validationReport as ValidationReport };
  }
  if (existing) ctx.tariffs.deleteDatasetCompletely(existing.id);

  let prepared: PreparedFile;
  try {
    prepared = prepareTariffFile(input.fileName, input.bytes);
  } catch (e) {
    if (e instanceof TariffFileError) throw new ImportError(e.message);
    throw e;
  }

  // Première passe légère pour l'année : colonne du fichier, sinon nom du fichier, sinon indication.
  let detectedYear: number | null = null;
  for (const parsed of parseTariffRows(prepared)) {
    if ("row" in parsed) {
      detectedYear = parsed.row.year;
      break;
    }
  }
  const year = detectedYear ?? yearFromFileName(prepared.csvName) ?? yearFromFileName(input.fileName) ?? input.yearHint ?? null;
  if (year === null) {
    throw new ImportError("Impossible de déterminer l'année des primes : indique-la lors de l'import.");
  }
  if (input.yearHint && detectedYear && input.yearHint !== detectedYear) {
    throw new ImportError(`Le fichier contient les primes ${detectedYear}, pas ${input.yearHint}.`);
  }

  const datasetId = ctx.tariffs.createDataset({
    year,
    sourceLabel: input.sourceLabel,
    sourceUrl: input.sourceUrl,
    fileName: input.fileName,
    fileSha256: sha,
    parserVersion: PARSER_VERSION,
  });

  let rowsRead = 0;
  let rowsRejected = 0;
  let duplicates = 0;
  let otherYearRows = 0;
  const errorCounts: Record<string, number> = {};
  const errorExamples: { line: number; message: string }[] = [];
  const insurerNames = new Map<number, string>();

  function* rows(): Generator<TariffInsert> {
    for (const parsed of parseTariffRows(prepared)) {
      rowsRead += 1;
      if ("error" in parsed) {
        rowsRejected += 1;
        const kind = parsed.error.replace(/«.*»/, "").trim();
        errorCounts[kind] = (errorCounts[kind] ?? 0) + 1;
        if (errorExamples.length < 30) errorExamples.push({ line: parsed.line, message: parsed.error });
        continue;
      }
      const r = parsed.row;
      if (r.year !== null && r.year !== year) {
        otherYearRows += 1;
        continue;
      }
      if (r.insurerName && !insurerNames.has(r.insurerId)) insurerNames.set(r.insurerId, r.insurerName);
      yield {
        insurerId: r.insurerId,
        canton: r.canton,
        region: r.region,
        ageClass: r.ageClass,
        ageSubgroup: r.ageSubgroup,
        accidentIncluded: r.accidentIncluded,
        modelType: r.modelType,
        tariffTypeRaw: r.tariffTypeRaw,
        tariffCode: r.tariffCode,
        tariffLabel: r.tariffLabel,
        franchiseChf: r.franchiseChf,
        monthlyPremiumRp: r.monthlyPremiumRp,
      };
    }
  }

  const inserted = ctx.tariffs.insertTariffs(datasetId, rows(), () => {
    duplicates += 1;
  });
  ctx.tariffs.ensureInsurers(ctx.tariffs.insurerIds(datasetId), insurerNames);

  const stats = ctx.tariffs.stats(datasetId);
  const byCanton = Object.fromEntries(stats.byCanton.map((r) => [r.canton, r.n]));
  const missingCantons = CANTONS.filter((c) => !byCanton[c]);
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (inserted === 0) blocking.push("Aucune ligne de prime valide n'a été lue.");
  if (rowsRead > 0 && rowsRejected / rowsRead > 0.02) {
    blocking.push(`${rowsRejected} lignes rejetées sur ${rowsRead} (plus de 2 %) : le format a probablement changé.`);
  } else if (rowsRejected > 0) {
    warnings.push(`${rowsRejected} lignes rejetées sur ${rowsRead}.`);
  }
  if (otherYearRows > 0) warnings.push(`${otherYearRows} lignes d'une autre année ont été ignorées.`);
  if (missingCantons.length > 0 && missingCantons.length < CANTONS.length) {
    warnings.push(`Cantons absents du fichier : ${missingCantons.join(", ")}.`);
  }
  if (stats.insurersWithoutStandard.length > 0) {
    warnings.push(`${stats.insurersWithoutStandard.length} assureur(s) sans tarif standard : ${stats.insurersWithoutStandard.join(", ")}.`);
  }
  if (stats.outOfBounds.length > 0) warnings.push(`${stats.outOfBounds.length} prime(s) hors des bornes plausibles.`);
  if (duplicates > 0) warnings.push(`${duplicates} doublon(s) ignoré(s).`);
  if ((stats.byModel.find((m) => m.model === "OTHER")?.n ?? 0) > 0) {
    warnings.push("Certains modèles « divers » n'ont pas pu être classés : vérifie-les dans les réglages.");
  }

  let yearOverYear: ValidationReport["yearOverYear"] = null;
  const previous = ctx.tariffs.activeDataset(year - 1);
  if (previous) {
    const pairs = ctx.tariffs.yearOverYear(datasetId, previous.id);
    const changes = pairs.map((p) => ({ ...p, changeBp: relativeChangeBp(p.fromRp, p.toRp) ?? 0 }));
    const byCantonChanges: Record<string, number[]> = {};
    for (const c of changes) (byCantonChanges[c.canton] ??= []).push(c.changeBp);
    const big = changes.filter((c) => Math.abs(c.changeBp) > BIG_CHANGE_BP);
    yearOverYear = {
      previousYear: previous.year,
      comparedProducts: changes.length,
      medianChangeBp: marketStats(changes.map((c) => c.changeBp))?.medianRp ?? null,
      medianChangeBpByCanton: Object.fromEntries(Object.entries(byCantonChanges).map(([canton, list]) => [canton, marketStats(list)!.medianRp])),
      bigChangeCount: big.length,
      bigChanges: big.slice(0, 50),
    };
    if (big.length > 0) warnings.push(`${big.length} produit(s) varient de plus de ±30 % par rapport à ${previous.year}.`);
  }

  const report: ValidationReport = {
    year,
    csvName: prepared.csvName,
    encoding: prepared.encoding,
    delimiter: prepared.delimiter,
    unknownColumns: prepared.unknownColumns,
    rowsRead,
    rowsImported: inserted,
    rowsRejected,
    duplicates,
    errorCounts,
    errorExamples,
    byCanton,
    missingCantons: missingCantons.length === CANTONS.length ? [] : missingCantons,
    insurerCount: stats.insurerCount,
    insurersWithoutStandard: stats.insurersWithoutStandard,
    byModel: Object.fromEntries(stats.byModel.map((m) => [m.model, m.n])),
    subgroups: stats.subgroups,
    outOfBoundsCount: stats.outOfBounds.length,
    outOfBoundsExamples: stats.outOfBounds.slice(0, 20),
    yearOverYear,
    blocking,
    warnings,
  };
  ctx.tariffs.finishDataset(datasetId, inserted, report);
  return { datasetId, duplicateOf: null, report };
}

export function activateDataset(ctx: AppContext, datasetId: number): void {
  const ds = ctx.tariffs.getDataset(datasetId);
  if (!ds) throw new ImportError("Jeu de données introuvable.");
  const report = ds.validationReport as ValidationReport;
  if (report.blocking?.length) throw new ImportError(`Activation impossible : ${report.blocking.join(" ")}`);
  if (ds.status === "DISCARDED") throw new ImportError("Ce jeu a été abandonné : réimporte le fichier.");
  ctx.tariffs.activateDataset(datasetId, ctx.clock.nowIso());
}

export function discardDataset(ctx: AppContext, datasetId: number): void {
  const ds = ctx.tariffs.getDataset(datasetId);
  if (!ds) throw new ImportError("Jeu de données introuvable.");
  if (ds.status === "ACTIVE") throw new ImportError("Un jeu actif ne peut pas être abandonné ; importe une version plus récente.");
  ctx.tariffs.discardDataset(datasetId);
}
