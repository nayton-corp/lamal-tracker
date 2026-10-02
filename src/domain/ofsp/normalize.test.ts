import { describe, expect, it } from "vitest";
import { classifyModel, mapHeader, normalizeRow, parseCanton, parseSwissTerritory, premiumKey } from "./normalize";
import { ImportAccumulator } from "./report";

const header = [
  "Versicherer", "Kanton", "Region", "Hoheitsgebiet", "Geschäftsjahr", "Erhebungsjahr",
  "Altersklasse", "Altersuntergruppe", "Unfalleinschluss", "Tarif", "Tariftyp",
  "Tarifbezeichnung", "Franchisestufe", "Franchise", "Prämie", "isBaseP", "isBaseF",
];

describe("en-tête", () => {
  it("trouve les colonnes, accents et casse tolérés", () => {
    const { index, missing } = mapHeader(header.map((h) => h.toUpperCase().replace("Ä", "A")));
    expect(missing).toEqual([]);
    expect(index["Prämie"]).toBe(14);
  });
  it("liste les colonnes manquantes", () => {
    expect(mapHeader(["Versicherer"]).missing).toContain("Prämie");
  });
});

describe("ligne", () => {
  const { index } = mapHeader(header);

  it("format 2027", () => {
    const r = normalizeRow([1562, "ZH", "PR_REG_1", "CH", 2027, 2026, "AKA_03_ERW", "E1", "OHN_UNF", "HEL-TEL", "TEL_DIG", "BeneFit PLUS Telmed", "FRAST6", "FRA_06_E_2500", 351.4, 0, 0], index);
    expect(r).toEqual({
      ok: true,
      row: {
        year: 2027, insurerBag: 1562, canton: "ZH", region: 1, ageClass: "ADULT", subgroup: "E1",
        accident: false, tariffCode: "HEL-TEL", tariffLabel: "BeneFit PLUS Telmed", tariffTypeRaw: "TEL_DIG",
        modelType: "TELMED", franchiseChf: 2500, monthlyPremiumRp: 35140,
      },
    });
  });

  it("format jusqu'à 2026", () => {
    const r = normalizeRow(["8", "VD", "PR-REG CH2", "", "2026", "2025", "AKL-KIN", "", "MIT-UNF", "CSS-B", "TAR-BASE", "Standard", "FRAST1", "FRA-0", "110.25", "1", "1"], index);
    expect(r.ok && r.row).toMatchObject({ canton: "VD", region: 2, ageClass: "KID", subgroup: "K1", accident: true, modelType: "STANDARD", franchiseChf: 0, monthlyPremiumRp: 11025 });
  });

  it("rejette sans deviner", () => {
    const row = [1, "ZH", "PR_REG_1", "CH", 2027, 2026, "AKA_03_ERW", "E1", "OHN_UNF", "T", "BASE", "x", "", "FRA_01_E_0300", 300, 0, 0];
    const bad = (i: number, v: unknown) => normalizeRow(row.map((c, j) => (j === i ? v : c)), index);
    expect(bad(3, "DE")).toEqual({ ok: false, reason: "hors_suisse" });
    expect(bad(1, "XX")).toEqual({ ok: false, reason: "canton_inconnu" });
    expect(bad(2, "Zone")).toEqual({ ok: false, reason: "region_illisible" });
    expect(bad(14, "n/a")).toEqual({ ok: false, reason: "prime_illisible" });
    expect(bad(13, "FRA")).toEqual({ ok: false, reason: "franchise_illisible" });
    expect(bad(6, "AKA_99")).toEqual({ ok: false, reason: "classe_age_illisible" });
  });

  it("tolère les codes préfixés de canton et de territoire", () => {
    expect(parseCanton("ZH")).toBe("ZH");
    expect(parseCanton("PR_KAN_ZH")).toBe("ZH");
    expect(parseCanton("KT-vd")).toBe("VD");
    expect(parseCanton("XX")).toBeNull();
    expect(parseSwissTerritory("CH")).toBe(true);
    expect(parseSwissTerritory("HGB_CH")).toBe(true);
    expect(parseSwissTerritory("P_OKPCH")).toBe(true);
    expect(parseSwissTerritory("P_OKPEU")).toBe(false);
    expect(parseSwissTerritory("Schweiz")).toBe(true);
    expect(parseSwissTerritory("DE")).toBe(false);
    expect(parseSwissTerritory("EU_DE")).toBe(false);
    expect(parseSwissTerritory("")).toBeNull();
  });

  it("classe les anciens tarifs « divers » d'après le libellé", () => {
    expect(classifyModel("TAR-DIV", "Telmed")).toBe("TELMED");
    expect(classifyModel("TAR-DIV", "Callmed")).toBe("TELMED");
    expect(classifyModel("TAR-DIV", "Pharmed")).toBe("PHARMACY");
    expect(classifyModel("TAR-HMO", "")).toBe("PRAXIS");
    expect(classifyModel("TAR-DIV", "Spécial")).toBe("OTHER");
  });
});

describe("rapport", () => {
  it("détecte un mélange d'années et des cantons absents", () => {
    const { index } = mapHeader(header);
    const acc = new ImportAccumulator();
    const keys = new Set<string>();
    for (const [year, prime] of [[2027, 400], [2027, 400], [2026, 380]] as const) {
      const r = normalizeRow([1, "ZH", "PR_REG_1", "CH", year, 2026, "AKA_03_ERW", "E1", "OHN_UNF", "T", "BASE", "x", "", "FRA_01_E_0300", prime, 0, 0], index);
      if (!r.ok) throw new Error();
      const k = `${r.row.year}|${premiumKey(r.row)}`;
      if (keys.has(k)) acc.duplicate();
      else { keys.add(k); acc.keep(r.row); }
    }
    const rep = acc.report([], { ZH: 20000 });
    expect(rep.stats.duplicates).toBe(1);
    expect(rep.ok).toBe(false);
    expect(rep.errors[0]).toMatch(/plusieurs années/);
    expect(rep.warnings.join()).toMatch(/Cantons absents/);
    expect(rep.warnings.join()).toMatch(/ZH : médiane adulte \+100 %/);
  });
});
