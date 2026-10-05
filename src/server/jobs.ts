import "server-only";
import fs from "node:fs";
import path from "node:path";
import { activeDataset } from "@/infrastructure/db/queries";
import { importPremiumFile, type ImportOutcome } from "@/infrastructure/ofsp/importer";
import { download, listArchives, resolvePremiumsUrl } from "@/infrastructure/ofsp/source";
import { currentYear, db } from "./context";

/*
 * Imports des primes OFSP en arrière-plan (téléchargement ou fichier téléversé), un seul à la
 * fois. L'état est gardé en mémoire du processus et affiché par la page d'administration.
 */

export interface ImportJob {
  running: boolean;
  phase: "idle" | "download" | "import" | "done" | "error";
  label: string;
  rowsRead: number;
  startedAt: string | null;
  finishedAt: string | null;
  outcome: ImportOutcome | null;
  /** Bilan d'un import d'archives (une ligne par année). */
  log: string[];
  error: string | null;
}

const globalForImportJob = globalThis as unknown as { __importJob?: ImportJob };

function state(): ImportJob {
  globalForImportJob.__importJob ??= { running: false, phase: "idle", label: "", rowsRead: 0, startedAt: null, finishedAt: null, outcome: null, log: [], error: null };
  return globalForImportJob.__importJob;
}

/** Copie de l'état de l'import en cours ou du dernier terminé. */
export function importJob(): ImportJob {
  return { ...state(), log: [...state().log] };
}

/** Dossier de la base (DATABASE_PATH) ; les fichiers téléchargés y passent aussi. */
export function dataDir(): string {
  return path.dirname(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lamal.db"));
}

function cantonFilter(): string[] | undefined {
  const raw = process.env.IMPORT_CANTONS?.trim();
  return raw ? raw.split(",").map((c) => c.trim().toUpperCase()) : undefined;
}

/**
 * Importe un fichier téléchargé ou téléversé, puis le supprime : son empreinte SHA-256 reste en
 * base (idempotence) et la carte SD du Pi n'accumule pas des dizaines de Mo par publication.
 */
async function importOne(job: ImportJob, file: string, origin: string): Promise<ImportOutcome> {
  job.phase = "import";
  job.rowsRead = 0;
  try {
    return await importPremiumFile(db(), file, origin, { cantons: cantonFilter(), onProgress: (n) => (job.rowsRead = n) });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** Exécute un import en arrière-plan ; un seul à la fois. Retourne false si un import tourne déjà. */
function run(label: string, work: (job: ImportJob) => Promise<void>): boolean {
  const job = state();
  if (job.running) return false;
  Object.assign(job, { running: true, phase: "download", label, rowsRead: 0, startedAt: new Date().toISOString(), finishedAt: null, outcome: null, log: [], error: null });
  void (async () => {
    try {
      await work(job);
      job.phase = "done";
    } catch (error) {
      job.phase = "error";
      job.error = error instanceof Error ? error.message : String(error);
      console.error("[import]", error);
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
    }
  })();
  return true;
}

/**
 * Lance un import en arrière-plan : téléchargement (fichier courant de l'OFSP par défaut) ou
 * fichier téléversé. Renvoie false si un import tourne déjà ; `onDone` reçoit le bilan.
 */
export function startImport(
  source: { kind: "download"; url?: string } | { kind: "file"; file: string; name: string },
  onDone?: (outcome: ImportOutcome) => void | Promise<void>,
): boolean {
  const label = source.kind === "file" ? source.name : "Téléchargement depuis opendata.swiss";
  return run(label, async (job) => {
    let file: string;
    let origin: string;
    if (source.kind === "download") {
      origin = source.url ?? (await resolvePremiumsUrl());
      file = await download(origin, path.join(dataDir(), "downloads"));
    } else {
      file = source.file;
      origin = `fichier : ${source.name}`;
    }
    job.outcome = await importOne(job, file, origin);
    await onDone?.(job.outcome);
  });
}

/**
 * Importe les primes d'une année : son archive annuelle, ou le fichier courant pour l'année en
 * cours et la suivante (pas encore archivées). Sans effet si l'année est déjà présente.
 * Une année passée sans archive échoue tout de suite : le fichier courant ne la contiendrait pas,
 * et le retélécharger à chaque demande occuperait l'unique créneau d'import pour rien.
 */
export function startYearImport(year: number): boolean {
  return run(`Primes ${year}`, async (job) => {
    if (activeDataset(db(), year)) return;
    const archive = (await listArchives()).find((a) => a.year === year);
    if (!archive && year < currentYear()) throw new Error(`Aucune archive OFSP pour ${year}.`);
    const url = archive?.url ?? (await resolvePremiumsUrl());
    const file = await download(url, path.join(dataDir(), "downloads"));
    job.outcome = await importOne(job, file, url);
  });
}

/**
 * Premier démarrage : primes publiées les plus récentes, puis celles de l'année en cours
 * (contrats actuels pré-remplis sans rien faire).
 */
export function startBootstrapImport(currentYear: number, onLatest?: (outcome: ImportOutcome) => void | Promise<void>): boolean {
  return run("Première importation des primes", async (job) => {
    const url = await resolvePremiumsUrl();
    const file = await download(url, path.join(dataDir(), "downloads"));
    job.outcome = await importOne(job, file, url);
    await onLatest?.(job.outcome);
    if (!activeDataset(db(), currentYear)) {
      const archive = (await listArchives()).find((a) => a.year === currentYear);
      if (archive) {
        job.phase = "download";
        job.label = `Archive ${currentYear}`;
        const f = await download(archive.url, path.join(dataDir(), "downloads"));
        job.outcome = await importOne(job, f, archive.url);
      }
    }
  });
}

/** Importe les archives OFSP des années précédentes qui ne sont pas encore dans la base. */
export function startArchivesImport(): boolean {
  return run("Archives des années précédentes", async (job) => {
    const archives = await listArchives();
    for (const a of archives) {
      if (activeDataset(db(), a.year)) {
        job.log.push(`${a.year} : déjà présent.`);
        continue;
      }
      job.phase = "download";
      job.label = `Archive ${a.year}`;
      try {
        const file = await download(a.url, path.join(dataDir(), "downloads"));
        const outcome = await importOne(job, file, a.url);
        job.outcome = outcome;
        job.log.push(
          outcome.status === "IMPORTED"
            ? `${outcome.report.year} : ${outcome.report.stats.rowsKept.toLocaleString("fr-CH")} primes importées.`
            : outcome.status === "ALREADY"
              ? `${a.year} : déjà importé.`
              : `${a.year} : refusé (${outcome.report.errors.join(" ")}).`,
        );
      } catch (error) {
        job.log.push(`${a.year} : indisponible (${error instanceof Error ? error.message : String(error)}).`);
      }
    }
  });
}
