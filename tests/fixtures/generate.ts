/**
 * Génère des fichiers de primes synthétiques au format OFSP (2026 : anciens codes,
 * 2027 : nouveaux codes) pour les tests et la démo. Primes inventées mais plausibles.
 */
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";


const INSURERS = [
  { bag: 1562, prefix: "HEL", factor: 1.08 },
  { bag: 8, prefix: "CSS", factor: 1.03 },
  { bag: 1542, prefix: "ASS", factor: 0.9 },
  { bag: 1384, prefix: "SWI", factor: 1.05 },
  { bag: 343, prefix: "AVE", factor: 0.96 },
  { bag: 1509, prefix: "SAN", factor: 0.99 },
];
const REGIONS: [string, number, number][] = [
  ["VD", 1, 520], ["VD", 2, 480], ["ZH", 1, 470], ["ZH", 2, 420], ["ZH", 3, 400], ["GE", 0, 610],
];
const MODELS = [
  { key: "BASE", old: "TAR-BASE", suffix: "BASE", label: "Assurance de base", factor: 1 },
  { key: "PRAXIS", old: "TAR-HAM", suffix: "HAM", label: "Médecin de famille", factor: 0.86 },
  { key: "TEL_DIG", old: "TAR-DIV", suffix: "TEL", label: "Telmed", factor: 0.82 },
];
const AGES = [
  { key: "AKA_01_KIN", old: "AKL-KIN", letter: "K", subgroups: ["K1", "K3"], factor: 0.24, franchises: [0, 100, 200, 300, 400, 500, 600] },
  { key: "AKA_02_JUG", old: "AKL-JUG", letter: "J", subgroups: ["J1"], factor: 0.72, franchises: [300, 500, 1000, 1500, 2000, 2500] },
  { key: "AKA_03_ERW", old: "AKL-ERW", letter: "E", subgroups: ["E1"], factor: 1, franchises: [300, 500, 1000, 1500, 2000, 2500] },
];
const HEADER = [
  "Versicherer", "Kanton", "Region", "Hoheitsgebiet", "Geschäftsjahr", "Erhebungsjahr",
  "Altersklasse", "Altersuntergruppe", "Unfalleinschluss", "Tarif", "Tariftyp",
  "Tarifbezeichnung", "Franchisestufe", "Franchise", "Prämie", "isBaseP", "isBaseF",
];

function franchiseFactor(franchise: number, kid: boolean): number {
  // Rabais proche du maximum légal (70 % du risque supplémentaire).
  const base = kid ? 0 : 300;
  return 1 - ((franchise - base) * 0.7 * 0.85) / 12 / (kid ? 140 : 480);
}

function rows(year: number): unknown[][] {
  const newFormat = year >= 2027;
  const growth = year >= 2027 ? 1 : 0.95;
  const out: unknown[][] = [];
  for (const ins of INSURERS) {
    // Une caisse change de code Telmed entre 2026 et 2027 (test de lignée).
    const codeFor = (m: (typeof MODELS)[number]) =>
      ins.prefix === "HEL" && m.suffix === "TEL" && !newFormat ? "HEL-TEL26" : `${ins.prefix}-${m.suffix}`;
    for (const [canton, region, base] of REGIONS) {
      for (const m of MODELS) {
        for (const age of AGES) {
          for (const sub of age.subgroups) {
            for (const accident of [false, true]) {
              age.franchises.forEach((f, i) => {
                const kid = age.letter === "K";
                const subFactor = sub === "K3" ? 0.5 : 1;
                const yearNoise = year >= 2027 ? 1 : 1 + ((ins.bag % 7) - 3) / 100;
                const premium =
                  base * ins.factor * m.factor * age.factor * subFactor * franchiseFactor(f, kid) *
                  (accident ? 1.07 : 1) * growth * yearNoise;
                const fra = newFormat
                  ? `FRA_${String(i + 1).padStart(2, "0")}_${age.letter}_${String(f).padStart(4, "0")}`
                  : `FRA-${f}`;
                const row = [
                  ins.bag, canton, newFormat ? `PR_REG_${region}` : `PR-REG CH${region}`, newFormat ? "P_OKPCH" : "CH", year, year - 1,
                  newFormat ? age.key : age.old, newFormat ? sub : kid ? sub : "",
                  newFormat ? (accident ? "MIT_UNF" : "OHN_UNF") : accident ? "MIT-UNF" : "OHN-UNF",
                  codeFor(m), newFormat ? m.key : m.old, `${m.label} ${ins.prefix}`,
                  `FRAST${i + 1}`, fra, Math.round(premium * 100) / 100,
                  m.key === "BASE" ? 1 : 0, i === 0 ? 1 : 0,
                ];
                out.push(row);
                // Avant 2027, les tarifs de base apparaissent en double.
                if (!newFormat && m.key === "BASE") out.push([...row]);
              });
            }
          }
        }
      }
    }
  }
  // Une ligne frontalière, à ignorer.
  out.push([8, "", "PR_REG_0", "DE", year, year - 1, "AKA_03_ERW", "E1", "OHN_UNF", "CSS-EU", "BASE", "EU", "FRAST1", "FRA_01_E_0300", 200, 1, 1]);
  return out;
}

async function writeXlsx(OUT: string, year: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(year >= 2027 ? "Sheet1" : "Export");
  ws.addRow(HEADER);
  for (const r of rows(year)) ws.addRow(r);
  const file = path.join(OUT, `primes-${year}.xlsx`);
  await wb.xlsx.writeFile(file);
  return file;
}

function writeCsv(OUT: string, year: number) {
  const file = path.join(OUT, `primes-${year}.csv`);
  const lines = [HEADER, ...rows(year)].map((r) => r.map((c) => (typeof c === "string" && c.includes(";") ? `"${c}"` : String(c))).join(";"));
  fs.writeFileSync(file, "﻿" + lines.join("\n"));
  return file;
}

export const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "generated");

export async function generateFixtures(out = FIXTURES_DIR): Promise<string[]> {
  fs.mkdirSync(out, { recursive: true });
  return [await writeXlsx(out, 2026), await writeXlsx(out, 2027), writeCsv(out, 2027)];
}
