import { cellText, type Sheet } from "./workbook";

/**
 * Annuaire officiel des assureurs-maladie reconnus (OFSP, « Verzeichnis der zugelassenen
 * Krankenversicherer », publié deux fois par an en xlsx sur bag.admin.ch).
 *
 * Le classeur est mis en page pour l'impression : une caisse occupe une ligne, ou plusieurs
 * lignes de continuation (Groupe Mutuel), avec des retours à la ligne et des césures dans les
 * cellules. On reconstitue ici, pour chaque caisse, sa raison sociale française et son adresse
 * postale, qui sert d'adresse de résiliation par défaut (siège ou adresse administrative).
 */
export interface DirectoryEntry {
  bagNumber: number;
  /** Raisons sociales par langue, dans l'ordre du fichier. */
  legalNames: string[];
  /** Raison sociale à utiliser dans une lettre en français. */
  legalNameFr: string;
  /** Lignes d'adresse postale (sans la raison sociale), dernière ligne = NPA localité. */
  address: string[];
  phone: string | null;
  email: string | null;
  website: string | null;
  group: string | null;
}

export interface Directory {
  /** Date de validité lue dans le classeur ou le nom du fichier (AAAA-MM-JJ), si connue. */
  validFrom: string | null;
  entries: DirectoryEntry[];
}

const NUMBER = /^\s*(\d{1,5})\s*(x)?\s*$/i;
const LEGAL_FORM_END = /\b(AG|SA|Sagl|GmbH|Sàrl)\s*$/;
const ITALIAN = /assicura|cassa|malatti|svizzera|infortuni/i;
const ADDRESS_PART =
  /\d|postfach|case postale|casella|route|rue|strasse|straße|gasse|weg|platz|allee|quai|place|chemin|avenue|piazza|via\b|abläsch|birspark/i;

/** Lignes non vides d'une cellule, césures de fin de ligne recollées. */
export function cellLines(v: unknown): string[] {
  const raw = cellText(v).split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const out: string[] = [];
  for (const line of raw) {
    if (!line) continue;
    const prev = out.at(-1);
    if (prev && /[A-Za-zÀ-ÿ]-$/.test(prev)) {
      // « Kranken-/Versicherung » garde le tiret, « Gesundheits-/versicherung » le perd,
      // « Kranken-/und Unfall… » est une ellipse : tiret et espace conservés.
      out[out.length - 1] = /^(und|oder|et|ou|e|o)\b/.test(line)
        ? `${prev} ${line}`
        : /^[a-zà-ÿ]/.test(line)
          ? prev.slice(0, -1) + line
          : prev + line;
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Regroupe les lignes d'un nom en variantes linguistiques (chacune se termine par sa forme juridique). */
export function splitLegalNames(lines: readonly string[]): string[] {
  const names: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    current.push(line);
    if (LEGAL_FORM_END.test(line)) {
      names.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) {
    if (names.length) names[names.length - 1] = `${names[names.length - 1]} ${current.join(" ")}`;
    else names.push(current.join(" "));
  }
  return names.map((n) => n.replace(/-\s+(?=[a-z])(?!(?:und|oder|et|ou|e|o)\b)/g, "").replace(/\s+/g, " ").trim());
}

/** Variante française : se termine par « SA » (ou forme française) et n'est pas italienne. */
export function frenchName(names: readonly string[]): string {
  const fr = names.find((n) => /\b(SA|Sàrl)$/.test(n) && !ITALIAN.test(n));
  return fr ?? names[0] ?? "";
}

/** Sépare adresse postale et coordonnées dans la cellule « Adresse ». */
export function splitAddress(lines: readonly string[]): Pick<DirectoryEntry, "address" | "phone" | "email" | "website"> {
  const contactStart = lines.findIndex((l) => /^(tel|tél|fax|kontakt)\b/i.test(l) || l.includes("@") || /^www\./i.test(l));
  const postal = contactStart === -1 ? [...lines] : lines.slice(0, contactStart);
  const rest = contactStart === -1 ? [] : lines.slice(contactStart);
  const cityIdx = postal.findLastIndex((l) => /^\d{4}\s+\S/.test(l));
  let address = postal;
  if (cityIdx >= 0) {
    let start = cityIdx;
    while (start > 0 && ADDRESS_PART.test(postal[start - 1]!)) start--;
    address = postal.slice(start, cityIdx + 1);
  }
  const phone = rest.find((l) => /^(tel|tél)\b/i.test(l))?.replace(/^(tel|tél)\.?\s*/i, "") ?? null;
  const email = rest.find((l) => l.includes("@"))?.trim() ?? null;
  const web = rest.find((l) => /^www\./i.test(l) || /^https?:/i.test(l)) ?? null;
  return { address, phone, email, website: web ? (/^https?:/i.test(web) ? web : `https://${web}`) : null };
}

function findDirectorySheet(sheets: readonly Sheet[]): Sheet | undefined {
  return (
    sheets.find((s) => /zugelassen|reconnus/i.test(s.name) && s.rows.some((r) => /nummer/i.test(cellText(r[0])))) ??
    sheets.find((s) => s.rows.some((r) => /nummer/i.test(cellText(r[0])) && /adresse/i.test(cellText(r[3]))))
  );
}

export function parseInsurerDirectory(sheets: readonly Sheet[]): Directory {
  const sheet = findDirectorySheet(sheets);
  if (!sheet) throw new Error("Annuaire des assureurs : feuille « Zugelassene Krankenversicherer » introuvable.");
  const header = sheet.rows.findIndex((r) => /nummer/i.test(cellText(r[0])));
  const cols = sheet.rows[header]!.map((c) => cellText(c).toLowerCase());
  const col = (re: RegExp, fallback: number) => {
    const i = cols.findIndex((c) => re.test(c));
    return i === -1 ? fallback : i;
  };
  const cName = col(/^name/, 2);
  const cAddress = col(/adresse/, 3);
  const cGroup = col(/gruppe|groupe/, 5);

  type Raw = { bag: number; dailyOnly: boolean; name: string[]; address: string[]; group: string[] };
  const raws: Raw[] = [];
  for (const row of sheet.rows.slice(header + 1)) {
    const first = cellText(row[0]);
    const m = NUMBER.exec(first);
    if (m) {
      raws.push({ bag: Number(m[1]), dailyOnly: Boolean(m[2]), name: [], address: [], group: [] });
    } else if (first.trim() || !raws.length) {
      continue;
    }
    const r = raws.at(-1)!;
    r.name.push(...cellLines(row[cName]));
    r.address.push(...cellLines(row[cAddress]));
    r.group.push(...cellLines(row[cGroup]));
  }

  const entries = raws
    .filter((r) => !r.dailyOnly)
    .map((r): DirectoryEntry => {
      const legalNames = splitLegalNames(r.name);
      const group = r.group.join(" ").replace(/\(.*?\)/g, "").trim();
      return {
        bagNumber: r.bag,
        legalNames,
        legalNameFr: frenchName(legalNames),
        ...splitAddress(r.address),
        group: !group || /^-+$/.test(group) ? null : group,
      };
    });
  if (entries.length < 20) throw new Error(`Annuaire des assureurs : ${entries.length} caisses lues seulement, format inattendu.`);
  return { validFrom: null, entries };
}

/** Lien du classeur le plus récent sur la page de l'OFSP, et sa date de validité (« 1.10.2026 »). */
export function pickDirectoryLink(html: string, base = "https://www.bag.admin.ch"): { url: string; validFrom: string | null } | null {
  const links = [...html.matchAll(/href="([^"]+\.xlsx)"/gi)]
    .map((m) => new URL(m[1]!.replace(/&amp;/g, "&"), base).toString())
    .filter((u) => /krankenversicherer|liste-assureurs/i.test(decodeURIComponent(u)) && !/r%C3%BCck|rück|reassur/i.test(u));
  const dated = links.map((url) => {
    const d = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(decodeURIComponent(url)) ?? /(\d{2})(\d{2})(\d{4})/.exec(url);
    const iso = d ? `${d[3]}-${d[2]!.padStart(2, "0")}-${d[1]!.padStart(2, "0")}` : null;
    return { url, validFrom: iso };
  });
  dated.sort((a, b) => (b.validFrom ?? "").localeCompare(a.validFrom ?? ""));
  return dated[0] ?? null;
}

export const DIRECTORY_PAGE_URL = "https://www.bag.admin.ch/de/verzeichnisse-der-zugelassenen-kranken-und-rueckversicherer";
