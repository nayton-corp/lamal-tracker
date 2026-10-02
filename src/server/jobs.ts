import "server-only";
import path from "node:path";
import { activeDataset } from "@/infrastructure/db/queries";
import { importPremiumFile, type ImportOutcome } from "@/infrastructure/ofsp/importer";
import { download, listArchives, resolvePremiumsUrl } from "@/infrastructure/ofsp/source";
import { db } from "./context";

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

const g = globalThis as unknown as { __importJob?: ImportJob };

function state(): ImportJob {
  g.__importJob ??= { running: false, phase: "idle", label: "", rowsRead: 0, startedAt: null, finishedAt: null, outcome: null, log: [], error: null };
  return g.__importJob;
}

export function importJob(): ImportJob {
  return { ...state(), log: [...state().log] };
}

export function dataDir(): string {
  return path.dirname(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lamal.db"));
}

function cantonFilter(): string[] | undefined {
  const raw = process.env.IMPORT_CANTONS?.trim();
  return raw ? raw.split(",").map((c) => c.trim().toUpperCase()) : undefined;
}

async function importOne(s: ImportJob, file: string, origin: string): Promise<ImportOutcome> {
  s.phase = "import";
  s.rowsRead = 0;
  return importPremiumFile(db(), file, origin, { cantons: cantonFilter(), onProgress: (n) => (s.rowsRead = n) });
}

/** Exécute un import en arrière-plan ; un seul à la fois. Retourne false si un import tourne déjà. */
function run(label: string, work: (s: ImportJob) => Promise<void>): boolean {
  const s = state();
  if (s.running) return false;
  Object.assign(s, { running: true, phase: "download", label, rowsRead: 0, startedAt: new Date().toISOString(), finishedAt: null, outcome: null, log: [], error: null });
  void (async () => {
    try {
      await work(s);
      s.phase = "done";
    } catch (error) {
      s.phase = "error";
      s.error = error instanceof Error ? error.message : String(error);
      console.error("[import]", error);
    } finally {
      s.running = false;
      s.finishedAt = new Date().toISOString();
    }
  })();
  return true;
}

export function startImport(
  source: { kind: "download"; url?: string } | { kind: "file"; file: string; name: string },
  onDone?: (outcome: ImportOutcome) => void | Promise<void>,
): boolean {
  const label = source.kind === "file" ? source.name : "Téléchargement depuis opendata.swiss";
  return run(label, async (s) => {
    let file: string;
    let origin: string;
    if (source.kind === "download") {
      origin = source.url ?? (await resolvePremiumsUrl());
      file = await download(origin, path.join(dataDir(), "downloads"));
    } else {
      file = source.file;
      origin = `fichier : ${source.name}`;
    }
    s.outcome = await importOne(s, file, origin);
    await onDone?.(s.outcome);
  });
}

/** Importe les archives OFSP des années précédentes qui ne sont pas encore dans la base. */
export function startArchivesImport(): boolean {
  return run("Archives des années précédentes", async (s) => {
    const archives = await listArchives();
    for (const a of archives) {
      if (activeDataset(db(), a.year)) {
        s.log.push(`${a.year} : déjà présent.`);
        continue;
      }
      s.phase = "download";
      s.label = `Archive ${a.year}`;
      try {
        const file = await download(a.url, path.join(dataDir(), "downloads"));
        const outcome = await importOne(s, file, a.url);
        s.outcome = outcome;
        s.log.push(
          outcome.status === "IMPORTED"
            ? `${outcome.report.year} : ${outcome.report.stats.rowsKept.toLocaleString("fr-CH")} primes importées.`
            : outcome.status === "ALREADY"
              ? `${a.year} : déjà importé.`
              : `${a.year} : refusé (${outcome.report.errors.join(" ")}).`,
        );
      } catch (error) {
        s.log.push(`${a.year} : indisponible (${error instanceof Error ? error.message : String(error)}).`);
      }
    }
  });
}
