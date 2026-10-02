import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "@/infrastructure/db/client";
import { extractPremiumFile, isXlsxZip } from "@/infrastructure/ofsp/archive";
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
});
