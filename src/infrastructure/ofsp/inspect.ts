import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import { extractPremiumFile, isXlsxZip } from "./archive";
import { readRows } from "./reader";

/** Diagnostic d'un fichier OFSP inattendu : contenu de l'archive, feuilles, premières lignes. */
export async function inspectFile(file: string, maxRows = 6): Promise<string[]> {
  const out: string[] = [];
  let target = file;
  try {
    if (!isXlsxZip(file)) {
      const zip = new AdmZip(file);
      out.push("Archive :", ...zip.getEntries().map((e) => `  ${e.entryName} (${e.header.size} o)`));
      target = extractPremiumFile(file);
      out.push(`Fichier retenu : ${target}`);
    }
  } catch {
    // pas un zip : csv
  }
  if (isXlsxZip(target)) {
    const wb = new ExcelJS.stream.xlsx.WorkbookReader(target, { sharedStrings: "cache", worksheets: "emit", styles: "ignore", hyperlinks: "ignore", entries: "emit" });
    let n = 0;
    for await (const ws of wb) {
      const name = (ws as unknown as { name?: string }).name ?? `feuille ${n + 1}`;
      out.push(`Feuille : ${name}`);
      let r = 0;
      for await (const row of ws as AsyncIterable<ExcelJS.Row>) {
        out.push(`  ${JSON.stringify((row.values as unknown[]).slice(1)).slice(0, 400)}`);
        if (++r >= maxRows) break;
      }
      if (++n >= 3) break;
    }
  } else {
    let r = 0;
    for await (const cells of readRows(target)) {
      out.push(`  ${JSON.stringify(cells).slice(0, 400)}`);
      if (++r >= maxRows) break;
    }
  }
  return out;
}
