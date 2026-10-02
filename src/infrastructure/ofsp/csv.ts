/**
 * Lecteur CSV minimal et tolérant (RFC 4180) : guillemets, guillemets doublés, retours à la ligne
 * dans les champs, fins de ligne CRLF/LF. Génère les lignes une par une pour limiter la mémoire.
 */
export function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

export function firstLine(text: string): string {
  const end = text.search(/\r?\n/);
  return end === -1 ? text : text.slice(0, end);
}

export function* parseCsv(text: string, delimiter: string): Generator<string[]> {
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(field);
      field = "";
      if (!(row.length === 1 && row[0] === "")) yield row;
      row = [];
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) yield row;
  }
}
