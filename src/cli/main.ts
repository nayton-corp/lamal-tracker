/**
 * Outils en ligne de commande (développement, CI, dépannage sur le Pi) :
 *
 *   pnpm cli import <fichier.xlsx|csv>   importe un fichier de primes
 *   pnpm cli download                    télécharge et importe le fichier OFSP courant
 *   pnpm cli url                         affiche l'URL OFSP résolue
 *   pnpm cli archives                    liste les archives annuelles disponibles
 *   pnpm cli download-archives           importe les archives absentes de la base
 *   pnpm cli inspect <fichier>           diagnostic : contenu, feuilles, premières lignes
 *
 * Base : DATABASE_PATH (défaut ./data/lamal.db). Code de sortie 1 si le fichier est refusé.
 */
import os from "node:os";
import path from "node:path";
import { openDb } from "@/infrastructure/db/client";
import { importPremiumFile, type ImportOutcome } from "@/infrastructure/ofsp/importer";
import { activeDataset } from "@/infrastructure/db/queries";
import { inspectFile } from "@/infrastructure/ofsp/inspect";
import { download, listArchives, resolvePremiumsUrl } from "@/infrastructure/ofsp/source";

function print(outcome: ImportOutcome) {
  if (outcome.status === "ALREADY") {
    console.log(`Déjà importé (jeu ${outcome.datasetId}, année ${outcome.year}).`);
    return;
  }
  const r = outcome.report;
  console.log(JSON.stringify({ status: outcome.status, year: r.year, stats: { ...r.stats, adultMedianByCanton: undefined }, errors: r.errors, warnings: r.warnings, samples: r.samples }, null, 2));
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
  if (command === "inspect" && arg) {
    for (const line of await inspectFile(path.resolve(arg))) console.log(line);
    return;
  }
  if (command === "archives") {
    for (const a of await listArchives()) console.log(`${a.year}${a.listed ? "" : " (URL déduite)"} : ${a.url}`);
    return;
  }
  if (command === "download-archives") {
    let imported = 0;
    let failed = 0;
    for (const a of await listArchives()) {
      if (activeDataset(db, a.year)) {
        console.log(`${a.year} : déjà présent`);
        continue;
      }
      console.log(`\n== Archive ${a.year} : ${a.url}`);
      try {
        const file = await download(a.url, path.join(os.tmpdir(), "lamal-downloads"));
        const outcome = await importPremiumFile(db, file, a.url);
        print(outcome);
        if (outcome.status === "IMPORTED") imported++;
        if (outcome.status === "FAILED") {
          failed++;
          if (failed <= 3) for (const line of await inspectFile(file)) console.log(line);
        }
      } catch (e) {
        console.log(`indisponible : ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`\nArchives importées : ${imported}, refusées : ${failed}`);
    if (failed > 0 || imported === 0) process.exit(1);
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
    console.error("Usage : cli import <fichier> | inspect <fichier> | download | url | archives | download-archives");
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
