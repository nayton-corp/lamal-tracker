import ExcelJS from "exceljs";
import fs from "node:fs";
import readline from "node:readline";
import { extractPremiumFile, isXlsxZip } from "./archive";

/** Lit les lignes d'un fichier de primes (xlsx en flux, ou csv) sous forme de tableaux de cellules. */
export async function* readRows(file: string): AsyncGenerator<unknown[]> {
  if (!(await isZip(file))) yield* readCsv(file);
  else if (isXlsxZip(file)) yield* readXlsx(file);
  else yield* readRows(extractPremiumFile(file)); // archive annuelle .zip
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

function looksLikeHeader(cells: readonly unknown[]): boolean {
  return cells.some((c) => typeof c === "string" && /^\s*versicherer\s*$/i.test(c));
}

const HEADER_SCAN_ROWS = 30;

/**
 * Lit la première feuille dont les premières lignes contiennent l'en-tête « Versicherer » :
 * certains classeurs commencent par une feuille d'information.
 */
async function* readXlsx(file: string): AsyncGenerator<unknown[]> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
    entries: "emit",
  });
  for await (const worksheet of reader) {
    const buffered: unknown[][] = [];
    let isData = false;
    for await (const row of worksheet as AsyncIterable<ExcelJS.Row>) {
      const values = row.values as unknown[];
      const cells: unknown[] = [];
      for (let i = 1; i < values.length; i++) cells.push(values[i]);
      if (isData) {
        yield cells;
        continue;
      }
      buffered.push(cells);
      if (looksLikeHeader(cells)) {
        isData = true;
        yield* buffered;
      } else if (buffered.length >= HEADER_SCAN_ROWS) {
        break; // pas une feuille de données : feuille suivante
      }
    }
    if (isData) return;
  }
}

/** UTF-8 si valide, sinon Latin-1 (anciens fichiers CSV de l'OFSP). */
async function csvEncoding(file: string): Promise<BufferEncoding> {
  const fd = await fs.promises.open(file, "r");
  try {
    const buf = Buffer.alloc(256 * 1024);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    try {
      // Une coupure au milieu d'un caractère en fin de tampon n'est pas une erreur.
      new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, Math.max(0, bytesRead - 4)));
      return "utf8";
    } catch {
      return "latin1";
    }
  } finally {
    await fd.close();
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
  const rl = readline.createInterface({ input: fs.createReadStream(file, await csvEncoding(file)), crlfDelay: Infinity });
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
