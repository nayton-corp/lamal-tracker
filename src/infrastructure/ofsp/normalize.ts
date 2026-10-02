import type { AgeClass } from "@/domain/age-class";
import { classifyModel, type ModelType } from "@/domain/insurance-model";
import { chfToRappen } from "@/domain/money";
import { isCanton } from "@/domain/tariff";

/**
 * Normalisation d'une ligne du fichier des primes OFSP (Priminfo, opendata.swiss).
 * Les noms de colonnes et les codes changent selon les années et les langues : chaque champ
 * accepte plusieurs alias et plusieurs formes de valeurs (codes « AKL-ERW », libellés FR/DE…).
 */
export const PARSER_VERSION = "ofsp-csv/1";

export type Field =
  | "insurer"
  | "insurerName"
  | "canton"
  | "region"
  | "ageClass"
  | "ageSubgroup"
  | "accident"
  | "year"
  | "tariffCode"
  | "tariffType"
  | "label"
  | "franchise"
  | "franchiseLevel"
  | "premium";

const ALIASES: Record<Field, string[]> = {
  insurer: [
    "versicherer",
    "versicherernr",
    "versicherernummer",
    "assureur",
    "noassureur",
    "numeroassureur",
    "insurer",
    "insurerid",
    "bagnr",
    "idversicherer",
    "krankenversicherer",
  ],
  insurerName: ["versicherername", "nameversicherer", "nomassureur", "assureurnom", "insurername", "name"],
  canton: ["kanton", "canton", "kt", "cantone"],
  region: ["region", "praemienregion", "pramienregion", "regiondeprimes", "regionprimes", "regione"],
  ageClass: ["altersklasse", "classedage", "classeage", "classedages", "ageclass", "alterskategorie", "classeeta"],
  ageSubgroup: ["altersuntergruppe", "sousgroupedage", "sousgroupeage", "agesubgroup"],
  accident: ["unfalleinschluss", "unfall", "unfalldeckung", "accident", "couvertureaccident", "avecaccident", "infortunio"],
  year: ["geschaftsjahr", "geschaeftsjahr", "annee", "anneecomptable", "exercice", "jahr", "year", "praemienjahr"],
  tariffCode: ["tarif", "tarifid", "codetarif", "tariff", "tarifcode", "tariffa"],
  tariffType: ["tariftyp", "typedetarif", "typetarif", "tarifftype", "tipotariffa"],
  label: ["tarifbezeichnung", "designationtarif", "designationdutarif", "bezeichnung", "libelle", "tariflabel", "designazionetariffa"],
  franchise: ["franchise", "franchigia"],
  franchiseLevel: ["franchisestufe", "niveaufranchise", "echelonfranchise"],
  premium: ["praemie", "pramie", "prime", "premium", "praemiechf", "primechf", "premio", "montant"],
};

export const REQUIRED_FIELDS: Field[] = ["insurer", "canton", "region", "ageClass", "accident", "franchise", "premium"];

export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type ColumnMap = Partial<Record<Field, number>>;

export function mapColumns(headers: string[]): { map: ColumnMap; missing: Field[]; unknown: string[] } {
  const map: ColumnMap = {};
  const unknown: string[] = [];
  headers.forEach((raw, index) => {
    const key = normalizeHeader(raw);
    const field = (Object.keys(ALIASES) as Field[]).find((f) => ALIASES[f].includes(key));
    if (field && map[field] === undefined) map[field] = index;
    else if (!field && raw.trim() !== "") unknown.push(raw.trim());
  });
  const missing = REQUIRED_FIELDS.filter((f) => map[f] === undefined);
  return { map, missing, unknown };
}

export interface NormalizedRow {
  insurerId: number;
  insurerName: string | null;
  canton: string;
  region: number;
  ageClass: AgeClass;
  ageSubgroup: string;
  accidentIncluded: boolean;
  year: number | null;
  tariffCode: string;
  tariffTypeRaw: string;
  tariffLabel: string;
  modelType: ModelType;
  franchiseChf: number;
  monthlyPremiumRp: number;
}

function stripAccents(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function parseAgeClass(raw: string): AgeClass | null {
  const v = stripAccents(raw).toUpperCase();
  if (/KIN|KIND|ENF|BAMB|0\s*-\s*18|^K$/.test(v)) return "KID";
  if (/JUG|JUNG|JEUN|GIOV|19\s*-\s*25|^J$/.test(v)) return "YOUNG";
  if (/ERW|ADUL|26|^E$|^A$/.test(v)) return "ADULT";
  return null;
}

export function parseAccident(raw: string): boolean | null {
  const v = stripAccents(raw).toUpperCase().trim();
  if (/OHN|SANS|SENZA|NEIN|^NON?$|FALSE|^0$|^N$/.test(v)) return false;
  if (/MIT|AVEC|CON|^JA$|^OUI$|^SI$|TRUE|^1$|^Y|^O$|^J$/.test(v)) return true;
  return null;
}

export function parseRegion(raw: string): number | null {
  const m = /(\d+)\s*$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 9 ? n : null;
}

export function parseCanton(raw: string): string | null {
  const m = /([A-Z]{2})\s*$/.exec(raw.trim().toUpperCase());
  return m && isCanton(m[1]!) ? m[1]! : null;
}

export function parseFranchise(raw: string): number | null {
  const m = /(\d+)(?:[.,]0+)?\s*$/.exec(raw.replace(/['’\s]/g, ""));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 0 && n <= 10_000 ? n : null;
}

export function parseInsurerId(raw: string): number | null {
  const v = raw.trim();
  if (!/^\d{1,5}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

export class RowError extends Error {}

export function normalizeRow(cells: string[], map: ColumnMap): NormalizedRow {
  const get = (f: Field): string => {
    const idx = map[f];
    return idx === undefined ? "" : (cells[idx] ?? "").trim();
  };
  const insurerId = parseInsurerId(get("insurer"));
  if (insurerId === null) throw new RowError(`Numéro d'assureur invalide « ${get("insurer")} »`);
  const canton = parseCanton(get("canton"));
  if (!canton) throw new RowError(`Canton invalide « ${get("canton")} »`);
  const region = parseRegion(get("region"));
  if (region === null) throw new RowError(`Région invalide « ${get("region")} »`);
  const ageClass = parseAgeClass(get("ageClass"));
  if (!ageClass) throw new RowError(`Classe d'âge invalide « ${get("ageClass")} »`);
  const accidentIncluded = parseAccident(get("accident"));
  if (accidentIncluded === null) throw new RowError(`Couverture accident invalide « ${get("accident")} »`);
  const franchiseChf = parseFranchise(get("franchise"));
  if (franchiseChf === null) throw new RowError(`Franchise invalide « ${get("franchise")} »`);
  let monthlyPremiumRp: number;
  try {
    monthlyPremiumRp = chfToRappen(get("premium"));
  } catch {
    throw new RowError(`Prime invalide « ${get("premium")} »`);
  }
  if (monthlyPremiumRp <= 0) throw new RowError(`Prime nulle ou négative « ${get("premium")} »`);
  const yearRaw = get("year");
  const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
  const tariffTypeRaw = get("tariffType");
  const tariffLabel = get("label") || tariffTypeRaw || get("tariffCode");
  const tariffCode = get("tariffCode") || tariffTypeRaw || "BASE";
  return {
    insurerId,
    insurerName: get("insurerName") || null,
    canton,
    region,
    ageClass,
    ageSubgroup: get("ageSubgroup"),
    accidentIncluded,
    year,
    tariffCode,
    tariffTypeRaw,
    tariffLabel,
    modelType: classifyModel(tariffTypeRaw, `${tariffLabel} ${tariffCode}`),
    franchiseChf,
    monthlyPremiumRp,
  };
}
