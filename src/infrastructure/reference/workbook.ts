import ExcelJS from "exceljs";

/*
 * Lecture des classeurs Excel des référentiels officiels (annuaire des caisses, données de
 * surveillance) : cellules ramenées à du texte, feuilles sous forme de tableaux.
 */

/** Texte d'une cellule ExcelJS (texte enrichi, formule, date…), sans espaces superflus en bout. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    if ("result" in v) return cellText((v as { result: unknown }).result);
    if ("text" in v) return String((v as { text: unknown }).text);
  }
  return String(v);
}

export interface Sheet {
  name: string;
  /** Lignes de cellules brutes (index 0 = colonne A). */
  rows: unknown[][];
}

/** Charge un classeur entier en mémoire (fichiers de référence de quelques Mo au plus). */
export async function readWorkbook(buf: Buffer | ArrayBuffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  return wb.worksheets.map((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const values = row.values as unknown[];
      rows[n - 1] = values.slice(1);
    });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    return { name: ws.name, rows };
  });
}
