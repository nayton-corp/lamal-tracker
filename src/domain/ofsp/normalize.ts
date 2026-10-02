import { isCanton, type AgeClass, type Canton, type ModelType } from "../lamal";
import type { Rappen } from "../money";

/**
 * Lecture d'une ligne du fichier « Prämien_CH » de l'OFSP. Deux générations de codes :
 *
 *   jusqu'à 2026 : PR-REG CH1, AKL-ERW, OHN-UNF, FRA-300, TAR-BASE/HAM/HMO/DIV,
 *                  tarifs de base en double (isBaseP)
 *   dès 2027     : PR_REG_1, AKA_03_ERW, OHN_UNF, FRA_01_E_0300,
 *                  BASE/PRAXIS/FLEX/TEL_DIG/PHARM
 *
 * Tout est ramené à une seule forme. Une ligne illisible n'est jamais devinée :
 * elle est rejetée avec une raison et comptée dans le rapport d'import.
 */

export const REQUIRED_COLUMNS = [
  "Versicherer",
  "Kanton",
  "Region",
  "Altersklasse",
  "Unfalleinschluss",
  "Tarif",
  "Tariftyp",
  "Franchise",
  "Prämie",
  "Geschäftsjahr",
] as const;

export const OPTIONAL_COLUMNS = ["Tarifbezeichnung", "Altersuntergruppe", "Hoheitsgebiet"] as const;

export type Column = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];

function key(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Associe chaque colonne connue à son index dans l'en-tête, en tolérant casse et accents. */
export function mapHeader(header: readonly unknown[]): {
  index: Partial<Record<Column, number>>;
  missing: string[];
} {
  const index: Partial<Record<Column, number>> = {};
  const wanted = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
  header.forEach((cell, i) => {
    const k = key(String(cell ?? ""));
    const match = wanted.find((w) => key(w) === k);
    if (match && index[match] === undefined) index[match] = i;
  });
  const missing = REQUIRED_COLUMNS.filter((c) => index[c] === undefined);
  return { index, missing };
}

export interface PremiumRow {
  year: number;
  insurerBag: number;
  canton: Canton;
  region: number;
  ageClass: AgeClass;
  subgroup: string;
  accident: boolean;
  tariffCode: string;
  tariffLabel: string;
  tariffTypeRaw: string;
  modelType: ModelType;
  franchiseChf: number;
  monthlyPremiumRp: Rappen;
}

export type SkipReason =
  | "hors_suisse"
  | "canton_inconnu"
  | "canton_vide"
  | "region_illisible"
  | "classe_age_illisible"
  | "accident_illisible"
  | "franchise_illisible"
  | "prime_illisible"
  | "assureur_illisible"
  | "annee_illisible"
  | "tarif_vide";

export type NormalizeResult = { ok: true; row: PremiumRow } | { ok: false; reason: SkipReason };

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "result" in v) return text((v as { result: unknown }).result);
  if (typeof v === "object" && v !== null && "richText" in v) {
    return ((v as { richText: { text: string }[] }).richText ?? []).map((r) => r.text).join("").trim();
  }
  return String(v).trim();
}

/** « ZH », « KT-ZH », « PR_KAN_ZH »… → ZH ; null si aucun code de canton reconnu. */
export function parseCanton(v: string): Canton | null {
  const u = v.trim().toUpperCase();
  if (isCanton(u)) return u;
  const m = /(?:^|[^A-Z])([A-Z]{2})$/.exec(u);
  return m && isCanton(m[1]!) ? m[1] : null;
}

/**
 * Hoheitsgebiet : « CH », « P_OKPCH » (valeur réelle 2027 : primes AOS Suisse), « Schweiz »… → true ;
 * un autre territoire (« DE », « P_OKPEU »…) → false ; vide → null.
 */
export function parseSwissTerritory(v: string): boolean | null {
  const u = v.trim().toUpperCase();
  if (!u) return null;
  return /CH$|^CHE$|SCHWEIZ|SUISSE|SVIZZERA/.test(u);
}

export function parseRegion(v: string): number | null {
  const m = /(\d)\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 3 ? n : null;
}

export function parseAgeClass(v: string): AgeClass | null {
  const u = v.toUpperCase();
  if (u.includes("KIN")) return "KID";
  if (u.includes("JUG")) return "YOUNG";
  if (u.includes("ERW")) return "ADULT";
  return null;
}

export function parseAccident(v: string): boolean | null {
  const u = v.toUpperCase();
  if (u.startsWith("MIT")) return true;
  if (u.startsWith("OHN") || u.startsWith("OHNE")) return false;
  return null;
}

/** FRA-300, FRA_01_E_0300, 300 → 300. */
export function parseFranchise(v: string): number | null {
  const m = /(\d+)\s*$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 0 && n <= 5000 ? n : null;
}

export function parsePremium(v: unknown): Rappen | null {
  const s = typeof v === "number" ? v : Number(text(v).replace(",", ".").replace(/['’\s]/g, ""));
  if (!Number.isFinite(s) || s <= 0 || s > 5000) return null;
  return Math.round(s * 100);
}

// Classement des anciens tarifs « divers » (TAR-DIV, jusqu'en 2026) d'après leur nom,
// vérifié sur les vrais libellés : Sanmed24, Premed-24, FlexHelp 24, EGK-TelCare,
// Digimed, AGRIcontact (télémédecine) ; FlexCare, PrimaFlex, Combi Care (flexibles).
const PHARMACY = /pharm|apothe|farmac/i;
const FLEX = /flex|combi|multi|choice/i;
const TELMED = /tele|télé|telmed|medgate|callmed|smart|digi|app\b|online|med ?call|tel|contact|24\b|-24/i;
const PRAXIS = /hmo|hausarzt|médecin|medecin|praxis|famil|centre|gesundheits?netz|zentrum|casa|réseau|netz/i;

export function classifyModel(tariffType: string, label: string): ModelType {
  const t = tariffType.toUpperCase().replace(/^TAR[-_]/, "");
  switch (t) {
    case "BASE":
      return "STANDARD";
    case "PRAXIS":
    case "HAM":
    case "HMO":
      return "PRAXIS";
    case "TEL_DIG":
    case "TEL":
      return "TELMED";
    case "PHARM":
      return "PHARMACY";
    case "FLEX":
      return "FLEX";
    default:
      if (PHARMACY.test(label)) return "PHARMACY";
      if (FLEX.test(label)) return "FLEX";
      if (TELMED.test(label)) return "TELMED";
      if (PRAXIS.test(label)) return "PRAXIS";
      return "OTHER";
  }
}

export function normalizeRow(
  cells: readonly unknown[],
  index: Partial<Record<Column, number>>,
): NormalizeResult {
  const get = (c: Column) => (index[c] === undefined ? "" : text(cells[index[c]!]));
  const raw = (c: Column) => (index[c] === undefined ? undefined : cells[index[c]!]);

  if (parseSwissTerritory(get("Hoheitsgebiet")) === false) return { ok: false, reason: "hors_suisse" };

  const rawCanton = get("Kanton");
  const canton = parseCanton(rawCanton);
  if (!canton) return { ok: false, reason: rawCanton ? "canton_inconnu" : "canton_vide" };

  const insurerBag = Number(get("Versicherer"));
  if (!Number.isInteger(insurerBag) || insurerBag <= 0) return { ok: false, reason: "assureur_illisible" };

  const year = Number(get("Geschäftsjahr"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, reason: "annee_illisible" };

  const region = parseRegion(get("Region"));
  if (region === null) return { ok: false, reason: "region_illisible" };

  const ageClass = parseAgeClass(get("Altersklasse"));
  if (!ageClass) return { ok: false, reason: "classe_age_illisible" };

  const accident = parseAccident(get("Unfalleinschluss"));
  if (accident === null) return { ok: false, reason: "accident_illisible" };

  const franchiseChf = parseFranchise(get("Franchise"));
  if (franchiseChf === null) return { ok: false, reason: "franchise_illisible" };

  const monthlyPremiumRp = parsePremium(raw("Prämie"));
  if (monthlyPremiumRp === null) return { ok: false, reason: "prime_illisible" };

  const tariffCode = get("Tarif");
  if (!tariffCode) return { ok: false, reason: "tarif_vide" };
  const tariffLabel = get("Tarifbezeichnung") || tariffCode;
  const tariffTypeRaw = get("Tariftyp");

  const subgroup =
    get("Altersuntergruppe").toUpperCase() ||
    (ageClass === "KID" ? "K1" : ageClass === "YOUNG" ? "J1" : "E1");

  return {
    ok: true,
    row: {
      year,
      insurerBag,
      canton,
      region,
      ageClass,
      subgroup,
      accident,
      tariffCode,
      tariffLabel,
      tariffTypeRaw,
      modelType: classifyModel(tariffTypeRaw, tariffLabel),
      franchiseChf,
      monthlyPremiumRp,
    },
  };
}

/** Clé métier d'une prime : unique dans un jeu (dédoublonne les tarifs de base d'avant 2027). */
export function premiumKey(r: PremiumRow): string {
  return [r.insurerBag, r.canton, r.region, r.ageClass, r.subgroup, r.accident ? 1 : 0, r.tariffCode, r.franchiseChf].join("|");
}
