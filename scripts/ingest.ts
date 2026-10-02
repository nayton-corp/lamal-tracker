/**
 * Import en ligne de commande d'un fichier de primes OFSP (CSV ou ZIP).
 * Usage : pnpm ingest <fichier> [--year 2027] [--activate]
 */
import fs from "node:fs";
import path from "node:path";
import { createContext, systemClock } from "@/application/context";
import { activateDataset, ImportError, importTariffFile } from "@/application/import-tariffs";
import { databasePath, dataDir, openDatabase } from "@/infrastructure/db/client";
import { diskFileStore } from "@/infrastructure/files";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const file = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--year");
if (!file) {
  console.error("Usage : pnpm ingest <fichier.csv|zip> [--year 2027] [--activate]");
  process.exit(1);
}

const ctx = createContext(openDatabase(databasePath()), systemClock, diskFileStore(dataDir()));
try {
  const result = importTariffFile(ctx, {
    fileName: path.basename(file),
    bytes: new Uint8Array(fs.readFileSync(file)),
    sourceLabel: `CLI : ${path.basename(file)}`,
    sourceUrl: null,
    yearHint: arg("year") ? Number(arg("year")) : null,
  });
  const r = result.report;
  console.log(`Jeu n° ${result.datasetId}${result.duplicateOf !== null ? " (déjà importé)" : ""} — primes ${r.year}`);
  console.log(`  ${r.rowsImported} tarifs, ${r.rowsRejected} rejetés, ${r.insurerCount} assureurs, ${Object.keys(r.byCanton).length} cantons`);
  for (const b of r.blocking) console.log(`  ✖ ${b}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  if (process.argv.includes("--activate")) {
    activateDataset(ctx, result.datasetId);
    console.log(`  ✓ Primes ${r.year} activées`);
  } else {
    console.log("  Vérifie le rapport dans Réglages → Primes OFSP puis active-le (ou relance avec --activate).");
  }
} catch (e) {
  console.error(e instanceof ImportError ? `Import refusé : ${e.message}` : e);
  process.exit(1);
}
