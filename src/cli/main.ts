/**
 * Outils en ligne de commande (développement, CI, dépannage sur le Pi) :
 *
 *   pnpm cli import <fichier.xlsx|csv>   importe un fichier de primes
 *   pnpm cli download                    télécharge et importe le fichier OFSP courant
 *   pnpm cli url                         affiche l'URL OFSP résolue
 *
 * Base : DATABASE_PATH (défaut ./data/lamal.db). Code de sortie 1 si le fichier est refusé.
 */
import os from "node:os";
import path from "node:path";
import { openDb } from "@/infrastructure/db/client";
import { importPremiumFile, type ImportOutcome } from "@/infrastructure/ofsp/importer";
import { download, resolvePremiumsUrl } from "@/infrastructure/ofsp/source";

function print(outcome: ImportOutcome) {
  if (outcome.status === "ALREADY") {
    console.log(`Déjà importé (jeu ${outcome.datasetId}, année ${outcome.year}).`);
    return;
  }
  const r = outcome.report;
  console.log(JSON.stringify({ status: outcome.status, year: r.year, stats: { ...r.stats, adultMedianByCanton: undefined }, errors: r.errors, warnings: r.warnings }, null, 2));
  const medians = Object.entries(r.stats.adultMedianByCanton)
    .sort()
    .map(([c, v]) => `${c} ${(v / 100).toFixed(2)}`)
    .join(" · ");
  if (medians) console.log(`Médianes adulte F300 sans accident : ${medians}`);
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  const db = openDb(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lamal.db"));
  if (command === "url") {
    console.log(await resolvePremiumsUrl());
    return;
  }
  let file: string;
  let source: string;
  if (command === "import" && arg) {
    file = path.resolve(arg);
    source = `fichier : ${path.basename(arg)}`;
  } else if (command === "download") {
    source = await resolvePremiumsUrl();
    console.log(`Téléchargement : ${source}`);
    file = await download(source, path.join(os.tmpdir(), "lamal-downloads"));
  } else {
    console.error("Usage : cli import <fichier> | cli download | cli url");
    process.exit(2);
  }
  const started = Date.now();
  let peakRss = 0;
  const outcome = await importPremiumFile(db, file, source, {
    onProgress: (n) => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      if (n % 100_000 < 2000) process.stdout.write(`\r${n.toLocaleString("fr-CH")} lignes`);
    },
  });
  process.stdout.write("\n");
  print(outcome);
  console.log(`Durée : ${((Date.now() - started) / 1000).toFixed(1)} s · mémoire max ${Math.round(peakRss / 1048576)} Mo`);
  if (outcome.status === "FAILED") process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
