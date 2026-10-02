import { detectDelimiter, firstLine, parseCsv } from "./csv";
import { decodeText, extractCsvFiles, isZip } from "./decode";
import { mapColumns, normalizeRow, RowError, type ColumnMap, type Field, type NormalizedRow } from "./normalize";

export class TariffFileError extends Error {}

export interface PreparedFile {
  /** Nom du fichier CSV retenu (dans l'archive le cas échéant). */
  csvName: string;
  encoding: string;
  delimiter: string;
  headers: string[];
  columns: ColumnMap;
  unknownColumns: string[];
  text: string;
}

function prepareCsv(name: string, bytes: Uint8Array): PreparedFile | { name: string; missing: Field[]; headers: string[] } {
  const { text, encoding } = decodeText(bytes);
  const header = firstLine(text);
  const delimiter = detectDelimiter(header);
  const headers = parseCsv(header, delimiter).next().value ?? [];
  const { map, missing, unknown } = mapColumns(headers);
  if (missing.length > 0) return { name, missing, headers };
  return { csvName: name, encoding, delimiter, headers, columns: map, unknownColumns: unknown, text };
}

/**
 * Ouvre un fichier de primes (CSV, ou ZIP contenant des CSV). Dans une archive, retient le premier CSV
 * dont les colonnes correspondent au format des primes ; les autres (régions, assureurs…) sont ignorés.
 */
export function prepareTariffFile(fileName: string, bytes: Uint8Array): PreparedFile {
  const candidates = isZip(bytes) ? extractCsvFiles(bytes) : [{ name: fileName, bytes }];
  if (candidates.length === 0) throw new TariffFileError("L'archive ne contient aucun fichier CSV.");
  const failures: string[] = [];
  // Les fichiers « primes » sont les plus gros : on les essaie d'abord.
  for (const c of [...candidates].sort((a, b) => b.bytes.length - a.bytes.length)) {
    const prepared = prepareCsv(c.name, c.bytes);
    if ("text" in prepared) return prepared;
    failures.push(
      `${prepared.name} : colonnes manquantes ${prepared.missing.join(", ")} (trouvées : ${prepared.headers.slice(0, 20).join(" | ")})`,
    );
  }
  throw new TariffFileError(`Format de fichier non reconnu.\n${failures.join("\n")}`);
}

export type ParsedLine = { line: number; row: NormalizedRow } | { line: number; error: string };

export function* parseTariffRows(file: PreparedFile): Generator<ParsedLine> {
  const rows = parseCsv(file.text, file.delimiter);
  rows.next(); // en-tête
  let line = 1;
  for (const cells of rows) {
    line += 1;
    if (cells.every((c) => c.trim() === "")) continue;
    try {
      yield { line, row: normalizeRow(cells, file.columns) };
    } catch (e) {
      if (e instanceof RowError) yield { line, error: e.message };
      else throw e;
    }
  }
}

/** Année des primes : colonne du fichier, sinon nom du fichier (« praemien_2027.csv »). */
export function yearFromFileName(name: string): number | null {
  const matches = [...name.matchAll(/(20\d{2})/g)].map((m) => Number(m[1]));
  return matches.length > 0 ? Math.max(...matches) : null;
}
