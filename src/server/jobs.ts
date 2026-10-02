import "server-only";
import path from "node:path";
import { importPremiumFile, type ImportOutcome } from "@/infrastructure/ofsp/importer";
import { download, resolvePremiumsUrl } from "@/infrastructure/ofsp/source";
import { db } from "./context";

export interface ImportJob {
  running: boolean;
  phase: "idle" | "download" | "import" | "done" | "error";
  label: string;
  rowsRead: number;
  startedAt: string | null;
  finishedAt: string | null;
  outcome: ImportOutcome | null;
  error: string | null;
}

const g = globalThis as unknown as { __importJob?: ImportJob };

function state(): ImportJob {
  g.__importJob ??= { running: false, phase: "idle", label: "", rowsRead: 0, startedAt: null, finishedAt: null, outcome: null, error: null };
  return g.__importJob;
}

export function importJob(): ImportJob {
  return { ...state() };
}

export function dataDir(): string {
  return path.dirname(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lamal.db"));
}

function cantonFilter(): string[] | undefined {
  const raw = process.env.IMPORT_CANTONS?.trim();
  return raw ? raw.split(",").map((c) => c.trim().toUpperCase()) : undefined;
}

/** Lance un import en arrière-plan (un seul à la fois). Retourne false si un import tourne déjà. */
export function startImport(
  source: { kind: "download"; url?: string } | { kind: "file"; file: string; name: string },
  onDone?: (outcome: ImportOutcome) => void | Promise<void>,
): boolean {
  const s = state();
  if (s.running) return false;
  Object.assign(s, { running: true, phase: "download", rowsRead: 0, startedAt: new Date().toISOString(), finishedAt: null, outcome: null, error: null });
  s.label = source.kind === "file" ? source.name : "Téléchargement depuis opendata.swiss";

  void (async () => {
    try {
      let file: string;
      let origin: string;
      if (source.kind === "download") {
        const url = source.url ?? (await resolvePremiumsUrl());
        file = await download(url, path.join(dataDir(), "downloads"));
        origin = url;
      } else {
        file = source.file;
        origin = `fichier : ${source.name}`;
      }
      s.phase = "import";
      const outcome = await importPremiumFile(db(), file, origin, {
        cantons: cantonFilter(),
        onProgress: (n) => (s.rowsRead = n),
      });
      s.outcome = outcome;
      s.phase = "done";
      await onDone?.(outcome);
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
