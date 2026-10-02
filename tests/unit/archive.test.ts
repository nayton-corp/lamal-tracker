import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "@/infrastructure/db/client";
import ExcelJS from "exceljs";
import { extractPremiumFile, isXlsxZip, premiumEntryScore } from "@/infrastructure/ofsp/archive";
import { importPremiumFile } from "@/infrastructure/ofsp/importer";
import { guessedArchiveUrl, pickArchiveResources } from "@/infrastructure/ofsp/source";
import { FIXTURES_DIR } from "../fixtures/generate";

function archiveOf(files: Record<string, string>): string {
  const zip = new AdmZip();
  for (const [name, src] of Object.entries(files)) zip.addFile(name, fs.readFileSync(src));
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zip-test-")), "Archiv_Praemien_2026.zip");
  zip.writeZip(target);
  return target;
}

describe("archives OFSP", () => {
  it("repère les archives annoncées par le catalogue", () => {
    const payload = {
      result: {
        resources: [
          { name: { de: "Prämien_CH.xlsx" }, url: "https://x/?path=a", format: "XLSX" },
          { name: { de: "Archiv_Praemien_2025.zip" }, url: "https://x/2025", format: "ZIP" },
          { title: "Archiv Prämien 2024", url: "https://x/2024", format: "ZIP" },
          { name: "", url: guessedArchiveUrl(2026) },
        ],
      },
    };
    expect(pickArchiveResources(payload).map((a) => [a.year, a.url])).toEqual([
      [2026, guessedArchiveUrl(2026)],
      [2025, "https://x/2025"],
      [2024, "https://x/2024"],
    ]);
  });

  it("distingue un xlsx d'une archive et en extrait le fichier des primes", () => {
    const xlsx = path.join(FIXTURES_DIR, "primes-2026.xlsx");
    expect(isXlsxZip(xlsx)).toBe(true);
    const zip = archiveOf({ "Tarife.csv": path.join(FIXTURES_DIR, "primes-2027.csv"), "Prämien_CH.xlsx": xlsx });
    expect(isXlsxZip(zip)).toBe(false);
    expect(fs.readFileSync(extractPremiumFile(zip)).equals(fs.readFileSync(xlsx))).toBe(true);
  });

  it("importe directement une archive annuelle", async () => {
    const db = openDb(":memory:");
    const zip = archiveOf({ "Archiv/Prämien_CH.xlsx": path.join(FIXTURES_DIR, "primes-2026.xlsx") });
    const outcome = await importPremiumFile(db, zip, "archive");
    expect(outcome.status).toBe("IMPORTED");
    expect(outcome.status === "IMPORTED" && outcome.report.year).toBe(2026);
  });

  it("choisit Prämien_CH parmi le contenu réel d'une archive", () => {
    const names = [
      "Eingeschr.-Tät.gebiete.xlsx", "Einzugsgebiete.csv", "Erläuterungen zu den Prämiendaten.xlsx",
      "Prämien_CH.csv", "Prämien_CH.xlsx", "Prämien_CHEU.xlsx", "Prämien_EU.csv", "Prämien_EU.xlsx",
      "Tarife.xlsx", "Versichertenbestand_CH.xlsx",
      "Pr\uFFFDmien_CH g\uFFFDltig_von_01.01.2024_bis_31.08.2024.xlsx", "Pr\uFFFDmien_CHEU g\uFFFDltig_von_01.01.2024_bis_31.08.2024.xlsx",
    ];
    const best = [...names].sort((a, b) => premiumEntryScore(b) - premiumEntryScore(a))[0];
    expect(best).toBe("Prämien_CH.xlsx");
    expect(premiumEntryScore("Prämien_CHEU.xlsx")).toBe(0);
    expect(premiumEntryScore("Prämien_EU.csv")).toBe(0);
    expect(premiumEntryScore("Versichertenbestand_CH.xlsx")).toBe(0);
    expect(premiumEntryScore("Pr\uFFFDmien_CH.csv")).toBeGreaterThan(premiumEntryScore("Pr\uFFFDmien_CH g\uFFFDltig_von_01.09.2024_bis_31.12.2024.xlsx"));
  });

  it("saute une feuille d'information et des lignes de titre", async () => {
    const src = new ExcelJS.Workbook();
    await src.xlsx.readFile(path.join(FIXTURES_DIR, "primes-2026.xlsx"));
    const data = src.worksheets[0]!;
    const wb = new ExcelJS.Workbook();
    const info = wb.addWorksheet("Info");
    info.addRow(["BAG OFSP UFSP SFOPH"]);
    info.addRow(["Prämienübersicht 2026"]);
    const sheet = wb.addWorksheet("Daten");
    sheet.addRow(["Prämien 2026"]);
    sheet.addRow([]);
    data.eachRow((row) => sheet.addRow((row.values as unknown[]).slice(1)));
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-test-")), "p.xlsx");
    await wb.xlsx.writeFile(file);
    const outcome = await importPremiumFile(openDb(":memory:"), file, "titres");
    expect(outcome.status).toBe("IMPORTED");
  });

  it("lit un CSV encodé en Latin-1", async () => {
    const csv = fs.readFileSync(path.join(FIXTURES_DIR, "primes-2027.csv"), "utf8").replace(/^\uFEFF/, "");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "csv-test-")), "p.csv");
    fs.writeFileSync(file, Buffer.from(csv, "latin1"));
    const outcome = await importPremiumFile(openDb(":memory:"), file, "latin1");
    expect(outcome.status).toBe("IMPORTED");
  });
});
