import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { listInsurers, saveInsurer } from "@/application/household";
import { openDb, type Db } from "@/infrastructure/db/client";
import { insurerAddressLines, insurerRecipient, parametersFor } from "@/infrastructure/db/queries";
import { insurerIndicator, lamalParameters } from "@/infrastructure/db/schema";
import { applyCo2, applyDirectory, officialCo2 } from "@/infrastructure/reference/apply";
import { scanCo2Amounts } from "@/infrastructure/reference/co2";
import { cellLines, parseInsurerDirectory, pickDirectoryLink, splitAddress, splitLegalNames } from "@/infrastructure/reference/insurer-directory";
import { parseSupervisoryData } from "@/infrastructure/reference/supervisory";
import { readWorkbook } from "@/infrastructure/reference/workbook";

const FIXTURE = path.join(import.meta.dirname, "..", "fixtures", "official", "zugelassene-krankenversicherer-2026-10.xlsx");

describe("annuaire officiel des caisses (OFSP)", () => {
  let entries: Awaited<ReturnType<typeof parseInsurerDirectory>>["entries"];
  beforeAll(async () => {
    entries = parseInsurerDirectory(await readWorkbook(fs.readFileSync(FIXTURE))).entries;
  });
  const byBag = (bag: number) => entries.find((e) => e.bagNumber === bag)!;

  it("lit toutes les caisses LAMal, sans les caisses d'indemnités journalières", () => {
    expect(entries).toHaveLength(34);
    expect(entries.some((e) => e.bagNumber === 1179 || e.bagNumber === 1402)).toBe(false);
  });

  it("retrouve la raison sociale française et l'adresse postale", () => {
    expect(byBag(8)).toMatchObject({
      legalNameFr: "CSS Assurance-maladie SA",
      address: ["Tribschenstrasse 21", "Postfach 2568", "6002 Luzern"],
      email: "css.info@css.ch",
      website: "https://www.css.ch",
      phone: "058 277 11 11",
    });
    expect(byBag(1562)).toMatchObject({ legalNameFr: "Helsana Assurances SA", address: ["Postfach", "8081 Zürich"] });
    expect(byBag(455).legalNameFr).toBe("ÖKK Kranken- und Unfallversicherungen AG");
    expect(byBag(312).legalNameFr).toBe("Atupri Assurance de la santé SA");
  });

  it("reconstitue les caisses du Groupe Mutuel réparties sur plusieurs lignes", () => {
    expect(byBag(343)).toMatchObject({ legalNameFr: "Avenir Assurance Maladie SA", address: ["Rue des Cèdres 5", "1919 Martigny"], group: "Groupe Mutuel", email: null });
    expect(byBag(1507)).toMatchObject({ address: ["Route de Verbier 13", "1934 Le Châble"] });
  });

  it("recolle les césures et sépare les variantes linguistiques", () => {
    expect(cellLines("Atupri Gesundheits-\nversicherung AG")).toEqual(["Atupri Gesundheitsversicherung AG"]);
    expect(cellLines("CSS Kranken-\nVersicherung AG")).toEqual(["CSS Kranken-Versicherung AG"]);
    expect(splitLegalNames(["Vivao Sympany AG", "Vivao Sympany SA"])).toEqual(["Vivao Sympany AG", "Vivao Sympany SA"]);
    expect(splitAddress(["Rue X 1", "1000 Lausanne", "Tel. 021 000 00 00", "a@b.ch", "www.b.ch"])).toEqual({
      address: ["Rue X 1", "1000 Lausanne"],
      phone: "021 000 00 00",
      email: "a@b.ch",
      website: "https://www.b.ch",
    });
  });

  it("choisit le classeur le plus récent sur la page de l'OFSP", () => {
    const html = `
      <a href="/dam/de/sd-web/a/Zugelassene%20Krankenversicherer_1.1.2026.xlsx">x</a>
      <a href="/dam/de/sd-web/b/Zugelassene%20Krankenversicherer_1.10.2026.xlsx">x</a>
      <a href="/dam/de/sd-web/c/Liste_Zugelassene_R%C3%BCckversicherer_1.1.2026.xlsx">x</a>`;
    expect(pickDirectoryLink(html)).toEqual({ url: "https://www.bag.admin.ch/dam/de/sd-web/b/Zugelassene%20Krankenversicherer_1.10.2026.xlsx", validFrom: "2026-10-01" });
  });
});

describe("données de surveillance (OFSP)", () => {
  it("repère les colonnes par leur code officiel", () => {
    const rows = parseSupervisoryData([
      { name: "info", rows: [["Aufsichtsdaten"]] },
      {
        name: "2024",
        rows: [
          ["T 5.01"],
          ["BAG-", "Name", "Durch-", "Prämien"],
          [0, null, 1, "3B", "5B", "13B", "12B", "4B", "6B", 7, "8B", "9B"],
          [8, "CSS", 1537730.4, 4054.51, 3955.25, 606.4, 4561.6, -70.4, 156.27, -22, 1058.1, 464.12],
          [null, "Total"],
        ],
      },
      { name: "2010", rows: [[0, null, 1, "3B", "5B", "9B"], [8, "CSS", 1, 2, 3, 4]] },
    ]);
    expect(rows).toEqual([
      { bagNumber: 8, year: 2024, insured: 1537730, premiumPerInsuredRp: 405451, benefitsPerInsuredRp: 395525, adminPerInsuredRp: 15627, reservesPerInsuredRp: 46412 },
    ]);
  });
});

describe("redistribution CO2 (OFEV)", () => {
  it("lit les montants annoncés dans les pages et mémentos", () => {
    const found = scanCo2Amounts(
      '<h4 class="t">Wieso Privatpersonen im Jahr 2025 CHF 61.80 erhalten</h4> … Jahr 2027 Fr. 57.– … Jahr 2030 CHF 9999.00',
    );
    expect([...found]).toEqual([
      [2025, 6180],
      [2027, 5700],
    ]);
  });

  it("embarque les montants officiels", () => {
    expect(officialCo2(2026)).toBe(6180);
    expect(officialCo2(2027)).toBe(5700);
    expect(officialCo2(1990)).toBeNull();
  });
});

describe("application des référentiels", () => {
  let db: Db;
  beforeAll(() => {
    db = openDb(":memory:");
  });
  const css = () => listInsurers(db).find((i) => i.bagNumber === 8)!;

  it("remplit les coordonnées officielles dès le premier démarrage", () => {
    expect(insurerRecipient(css())).toEqual(["CSS Assurance-maladie SA", "Tribschenstrasse 21", "Postfach 2568", "6002 Luzern"]);
    expect(css().directoryDate).toBe("2026-10-01");
    expect(db.select().from(insurerIndicator).where(eq(insurerIndicator.bagNumber, 8)).all().length).toBeGreaterThan(5);
    expect(parametersFor(db, new Date().getFullYear() + 1).co2AnnualRp).not.toBeNull();
  });

  it("garde l'adresse saisie par l'utilisateur quand l'annuaire change", () => {
    saveInsurer(db, { id: css().id, terminationAddress: "Case postale 2568\n6002 Lucerne" }, "2026-10-05T08:00:00Z");
    applyDirectory(db, { validFrom: "2027-01-01", entries: [{ bagNumber: 8, legalNames: ["CSS SA"], legalNameFr: "CSS SA", address: ["Neue Strasse 1", "6000 Luzern"], phone: null, email: null, website: null, group: null }] });
    expect(insurerAddressLines(css())).toEqual(["Case postale 2568", "6002 Lucerne"]);
    expect(css().officialAddress).toBe("Neue Strasse 1\n6000 Luzern");
  });

  it("met à jour le CO2 officiel mais jamais un montant saisi", () => {
    db.insert(lamalParameters)
      .values([
        { year: 2040, franchisesAdult: [300], franchisesKid: [0], coinsuranceRateBp: 1000, coinsuranceMaxAdultRp: 70000, coinsuranceMaxKidRp: 35000, co2AnnualRp: null },
        { year: 2041, franchisesAdult: [300], franchisesKid: [0], coinsuranceRateBp: 1000, coinsuranceMaxAdultRp: 70000, coinsuranceMaxKidRp: 35000, co2AnnualRp: 5000, co2Source: "USER" },
      ])
      .run();
    expect(applyCo2(db, new Map([[2040, 6000], [2041, 6100]]))).toBe(1);
    expect(parametersFor(db, 2040).co2AnnualRp).toBe(6000);
    expect(parametersFor(db, 2041).co2AnnualRp).toBe(5000);
  });
});
