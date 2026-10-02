import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Un fichier xlsx est lui-même un zip : on le reconnaît à son [Content_Types].xml. */
export function isXlsxZip(file: string): boolean {
  try {
    return new AdmZip(file).getEntry("[Content_Types].xml") !== null;
  } catch {
    return false;
  }
}

/**
 * Score d'un fichier d'archive OFSP. Une archive contient une quinzaine de fichiers :
 * Prämien_CH (les données voulues), Prämien_CHEU (rapport croisé), Prämien_EU (frontaliers),
 * Tarife, Einzugsgebiete… ; en 2024 aussi des versions datées « gültig_von_… » (correction
 * de septembre). On veut Prämien_CH.xlsx, sinon Prämien_CH.csv, sinon une version datée.
 * Les noms peuvent être mal encodés (« Pr�mien ») : on tolère le caractère.
 */
export function premiumEntryScore(name: string): number {
  const base = path.basename(name).toLowerCase();
  if (!/^pr.{1,3}mien_ch[ ._]/.test(base) || /^pr.{1,3}mien_ch\s*eu|_eu\b/.test(base)) return 0;
  const exact = /^pr.{1,3}mien_ch\.(xlsx|csv)$/.test(base) ? 10 : 5;
  return exact + (base.endsWith(".xlsx") ? 2 : base.endsWith(".csv") ? 1 : -100);
}

/** Taille décompressée maximale d'une entrée (le fichier réel fait quelques dizaines de Mo). */
export const MAX_ENTRY_BYTES = 300 * 1024 * 1024;

/**
 * Archive annuelle de l'OFSP (Archiv_Praemien_AAAA.zip) : extrait le fichier des primes dans un
 * dossier temporaire. L'appelant supprime ce dossier (`path.dirname`) une fois le fichier lu.
 */
export function extractPremiumFile(zipFile: string): string {
  const zip = new AdmZip(zipFile);
  const entries = zip.getEntries().filter((e) => !e.isDirectory && /\.(xlsx|csv)$/i.test(e.entryName));
  if (entries.length === 0) throw new Error("Archive sans fichier xlsx ou csv.");
  const ranked = [...entries]
    .map((e) => ({ e, score: premiumEntryScore(e.entryName) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.entryName.localeCompare(b.e.entryName));
  if (ranked.length === 0) {
    throw new Error(`Archive sans fichier « Prämien_CH » (contenu : ${entries.map((e) => path.basename(e.entryName)).join(", ")}).`);
  }
  const best = ranked[0]!.e;
  // adm-zip décompresse en mémoire : on refuse une entrée démesurée (zip bomb) avant de la lire.
  if (best.header.size > MAX_ENTRY_BYTES) {
    throw new Error(`Fichier « ${path.basename(best.entryName)} » trop volumineux (${Math.round(best.header.size / 1048576)} Mo décompressés).`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-archive-"));
  const target = path.join(dir, /\.xlsx$/i.test(best.entryName) ? "primes.xlsx" : "primes.csv");
  fs.writeFileSync(target, best.getData());
  return target;
}
