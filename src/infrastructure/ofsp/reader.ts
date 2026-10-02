import ExcelJS from "exceljs";
import fs from "node:fs";
import readline from "node:readline";

/** Lit les lignes d'un fichier de primes (xlsx en flux, ou csv) sous forme de tableaux de cellules. */
export async function* readRows(file: string): AsyncGenerator<unknown[]> {
  if (await isZip(file)) yield* readXlsx(file);
  else yield* readCsv(file);
}

async function isZip(file: string): Promise<boolean> {
  const fd = await fs.promises.open(file, "r");
  try {
    const buf = Buffer.alloc(2);
    await fd.read(buf, 0, 2, 0);
    return buf.toString("latin1") === "PK";
  } finally {
    await fd.close();
  }
}

async function* readXlsx(file: string): AsyncGenerator<unknown[]> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
    entries: "emit",
  });
  for await (const worksheet of reader) {
    for await (const row of worksheet as AsyncIterable<ExcelJS.Row>) {
      const values = row.values as unknown[];
      const cells: unknown[] = [];
      for (let i = 1; i < values.length; i++) cells.push(values[i]);
      yield cells;
    }
    return; // une seule feuille
  }
}

export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function* readCsv(file: string): AsyncGenerator<unknown[]> {
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let delimiter: string | null = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, "");
    if (!line.trim()) continue;
    if (delimiter === null) {
      const counts = [";", ",", "\t"].map((d) => [d, line.split(d).length] as const);
      delimiter = counts.sort((a, b) => b[1] - a[1])[0]![0];
    }
    yield splitCsvLine(line, delimiter);
  }
}
