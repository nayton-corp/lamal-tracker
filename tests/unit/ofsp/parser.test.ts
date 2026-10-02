import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv } from "@/infrastructure/ofsp/csv";
import { decodeText } from "@/infrastructure/ofsp/decode";
import { mapColumns, normalizeHeader, parseAccident, parseAgeClass, parseCanton, parseFranchise, parseRegion } from "@/infrastructure/ofsp/normalize";
import { parseTariffRows, prepareTariffFile, TariffFileError, yearFromFileName } from "@/infrastructure/ofsp/parser";
import { buildOfspCsv, fixtureBytes } from "../../fixtures/ofsp";

describe("CSV", () => {
  it("gère guillemets, séparateurs et sauts de ligne dans les champs", () => {
    const rows = [...parseCsv('a;"b;c";"d ""e"""\r\n1;"multi\nligne";3\n\n4;5;6', ";")];
    expect(rows).toEqual([
      ["a", "b;c", 'd "e"'],
      ["1", "multi\nligne", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("détecte le séparateur", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });

  it("décode BOM UTF-8, UTF-16 et Windows-1252", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])).text).toBe("A");
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00])).text).toBe("A");
    const latin1 = decodeText(new Uint8Array([0x50, 0x72, 0xe4, 0x6d, 0x69, 0x65])); // « Prämie »
    expect(latin1).toEqual({ text: "Prämie", encoding: "windows-1252" });
  });
});

describe("normalisation des valeurs", () => {
  it.each([
    ["AKL-ERW", "ADULT"],
    ["AKL-JUG", "YOUNG"],
    ["AKL-KIN", "KID"],
    ["Junge Erwachsene", "YOUNG"],
    ["Erwachsene", "ADULT"],
    ["Enfants", "KID"],
    ["jeunes adultes", "YOUNG"],
    ["19-25", "YOUNG"],
    ["???", null],
  ] as const)("classe d'âge %s", (raw, expected) => {
    expect(parseAgeClass(raw)).toBe(expected);
  });

  it.each([
    ["MIT-UNF", true],
    ["OHN-UNF", false],
    ["avec accident", true],
    ["sans accident", false],
    ["1", true],
    ["0", false],
    ["ja", true],
    ["nein", false],
    ["peut-être", null],
  ] as const)("accident %s", (raw, expected) => {
    expect(parseAccident(raw)).toBe(expected);
  });

  it("régions, cantons, franchises", () => {
    expect(parseRegion("PR-REG CH0")).toBe(0);
    expect(parseRegion("2")).toBe(2);
    expect(parseRegion("abc")).toBeNull();
    expect(parseCanton("VD")).toBe("VD");
    expect(parseCanton("CH-ge")).toBe("GE");
    expect(parseCanton("XX")).toBeNull();
    expect(parseFranchise("FRA-2500")).toBe(2500);
    expect(parseFranchise("1'500")).toBe(1500);
    expect(parseFranchise("300.00")).toBe(300);
    expect(parseFranchise("-")).toBeNull();
  });

  it("reconnaît les en-têtes allemands et français", () => {
    expect(normalizeHeader("Geschäftsjahr")).toBe("geschaftsjahr");
    const de = mapColumns(["Versicherer", "Kanton", "Region", "Altersklasse", "Unfalleinschluss", "Franchise", "Prämie", "Bidon"]);
    expect(de.missing).toEqual([]);
    expect(de.unknown).toEqual(["Bidon"]);
    const fr = mapColumns(["Assureur", "Canton", "Région", "Classe d'âge", "Accident", "Franchise", "Prime"]);
    expect(fr.missing).toEqual([]);
    expect(mapColumns(["Versicherer", "Kanton"]).missing).toContain("premium");
  });

  it("lit l'année dans le nom de fichier", () => {
    expect(yearFromFileName("praemien_2027_ch.csv")).toBe(2027);
    expect(yearFromFileName("Prämien_CH.csv")).toBeNull();
  });
});

describe("lecture d'un fichier OFSP", () => {
  it("lit le format officiel (allemand, BOM, CRLF)", () => {
    const prepared = prepareTariffFile("Prämien_CH.csv", fixtureBytes({ year: 2027 }));
    const rows = [...parseTariffRows(prepared)];
    expect(rows.every((r) => "row" in r)).toBe(true);
    const first = rows[0] as { row: { insurerId: number; ageClass: string; year: number; franchiseChf: number } };
    expect(first.row.insurerId).toBe(8);
    expect(first.row.year).toBe(2027);
    const telmed = rows.find((r) => "row" in r && r.row.tariffCode === "TEL-MED");
    expect(telmed && "row" in telmed && telmed.row.modelType).toBe("TELMED");
    const pharm = rows.find((r) => "row" in r && r.row.tariffCode === "PHARMED");
    expect(pharm && "row" in pharm && pharm.row.modelType).toBe("PHARMACY");
  });

  it("lit la variante française avec virgules décimales", () => {
    const prepared = prepareTariffFile("primes.csv", new TextEncoder().encode(buildOfspCsv({ year: 2026, french: true })));
    const rows = [...parseTariffRows(prepared)];
    expect(rows.filter((r) => "error" in r)).toEqual([]);
    const kid = rows.find((r) => "row" in r && r.row.ageClass === "KID");
    expect(kid && "row" in kid && kid.row.accidentIncluded).toBe(false);
  });

  it("trouve le bon CSV dans une archive ZIP", () => {
    const zip = zipSync({
      "readme.txt": new TextEncoder().encode("Lisez-moi"),
      "regions.csv": new TextEncoder().encode("Kanton;Region;Gemeinde\nVD;1;Lausanne\n"),
      "data/Praemien_CH.csv": new TextEncoder().encode(buildOfspCsv({ year: 2027 })),
    });
    const prepared = prepareTariffFile("praemien.zip", zip);
    expect(prepared.csvName).toBe("data/Praemien_CH.csv");
  });

  it("explique un format inconnu", () => {
    expect(() => prepareTariffFile("x.csv", new TextEncoder().encode("foo;bar\n1;2\n"))).toThrow(TariffFileError);
    try {
      prepareTariffFile("x.csv", new TextEncoder().encode("foo;bar\n1;2\n"));
    } catch (e) {
      expect((e as Error).message).toContain("colonnes manquantes");
      expect((e as Error).message).toContain("foo | bar");
    }
  });

  it("signale les lignes invalides sans s'arrêter", () => {
    const csv = buildOfspCsv({ year: 2027 }).split("\r\n");
    csv.splice(2, 0, "0008;ZZ;PR-REG CH0;AKL-ERW;OHN-UNF;2027;2026;BASE;TAR-BASE;;FRAST1;FRA-300;400.00;1;1;1;Standard;1");
    csv.splice(3, 0, "0008;VD;PR-REG CH1;AKL-ERW;OHN-UNF;2027;2026;BASE;TAR-BASE;;FRAST1;FRA-300;abc;1;1;1;Standard;1");
    const rows = [...parseTariffRows(prepareTariffFile("p.csv", new TextEncoder().encode(csv.join("\r\n"))))];
    const errors = rows.filter((r) => "error" in r);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ line: 3 });
    expect((errors[0] as { error: string }).error).toContain("Canton");
    expect((errors[1] as { error: string }).error).toContain("Prime");
  });
});
