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
 * Archive annuelle de l'OFSP (Archiv_Praemien_AAAA.zip) : extrait le fichier des primes
 * (« Prämien_CH », xlsx de préférence, sinon csv ; à défaut le plus gros xlsx/csv).
 * Les noms dans un zip peuvent être mal encodés (« PrΣmien ») : on tolère le caractère.
 */
export function extractPremiumFile(zipFile: string): string {
  const zip = new AdmZip(zipFile);
  const entries = zip.getEntries().filter((e) => !e.isDirectory && /\.(xlsx|csv)$/i.test(e.entryName));
  if (entries.length === 0) throw new Error("Archive sans fichier xlsx ou csv.");
  const score = (name: string) => {
    const base = path.basename(name);
    const premium = /pr.{1,2}mien[_ ]?ch/i.test(base) || /^pr.{1,2}mien/i.test(base) ? 10 : 0;
    return premium + (/\.xlsx$/i.test(base) ? 2 : 1);
  };
  const best = [...entries].sort((a, b) => score(b.entryName) - score(a.entryName) || b.header.size - a.header.size)[0]!;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-archive-"));
  const target = path.join(dir, /\.xlsx$/i.test(best.entryName) ? "primes.xlsx" : "primes.csv");
  fs.writeFileSync(target, best.getData());
  return target;
}
