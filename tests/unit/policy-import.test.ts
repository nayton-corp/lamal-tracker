import path from "node:path";
import React from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { beforeAll, describe, expect, it } from "vitest";
import { listInsurers, listLca, listPolicies, saveHousehold, savePerson } from "@/application/household";
import { analyzePolicyText, applyPolicyImport } from "@/application/policy-import";
import { tariffOptions } from "@/application/tariffs";
import { formatChf } from "@/domain/money";
import { extractPolicy, readAccident, readAmounts, readFranchise, readLca, readModel, readPolicyNumber, readYear } from "@/domain/policy-import";
import { openDb, type Db } from "@/infrastructure/db/client";
import { importPremiumFile } from "@/infrastructure/ofsp/importer";
import { readPdfText } from "@/infrastructure/pdf/read-text";
import { FIXTURES_DIR } from "../fixtures/generate";

describe("lecture d'une police (texte)", () => {
  it("lit montants, franchise, accident, modèle et numéro", () => {
    expect(readAmounts("Prime mensuelle CHF 1'234.50 puis 412,30 et 57.– en 2026")).toEqual([123450, 41230, 5700]);
    expect(readFranchise("Franchise annuelle : CHF 2'500", [300, 2500])).toBe(2500);
    expect(readFranchise("Jahresfranchise 300", [300, 2500])).toBe(300);
    expect(readAccident("Couverture accidents : non")).toBe(false);
    expect(readAccident("ohne Unfalldeckung")).toBe(false);
    expect(readAccident("inkl. Unfall")).toBe(true);
    expect(readModel("Modèle Telmed : appelez d'abord")).toBe("TELMED");
    expect(readModel("Hausarztmodell BeneFit")).toBe("PRAXIS");
    expect(readPolicyNumber("N° d'assuré : 123.456.78 Date")).toBe("123.456.78");
    expect(readPolicyNumber("Versichertennummer: K-998877")).toBe("K-998877");
    expect(readYear("Police valable dès le 01.01.2026, primes 2026", 2010, 2027)).toBe(2026);
  });

  it("repère les complémentaires par familles", () => {
    const lca = readLca("Assurances complémentaires LCA : Hospitalisation demi-privée CHF 85.40 ; Soins dentaires 22.00");
    expect(lca).toEqual([
      { guarantee: "HOSPITAL_SEMI_PRIVATE", monthlyRp: 8540 },
      { guarantee: "DENTAL", monthlyRp: 2200 },
    ]);
    expect(readLca("Zusatzversicherungen VVG: Spital halbprivat 120.00")[0]).toEqual({ guarantee: "HOSPITAL_SEMI_PRIVATE", monthlyRp: 12000 });
  });

  it("découpe par personne grâce aux dates de naissance", () => {
    const res = extractPolicy(
      "Police KVG Helsana 2026\nMüller Anna, 03.04.1990 Franchise 2500 ohne Unfall Prämie 300.10\nMüller Tim 1.2.2015 Franchise 0 mit Unfall 99.90",
      {
        persons: [
          { id: 1, firstName: "Anna", lastName: "Müller", birthDate: "1990-04-03" },
          { id: 2, firstName: "Tim", lastName: "Müller", birthDate: "2015-02-01" },
        ],
        insurers: [{ id: 7, names: ["Helsana"] }, { id: 8, names: ["CSS"] }],
        franchises: [0, 300, 2500],
        minYear: 2010,
        maxYear: 2027,
      },
    );
    expect(res.insurerId).toBe(7);
    expect(res.persons.map((p) => [p.personId, p.franchiseChf, p.accident, p.amountsRp])).toEqual([
      [1, 2500, false, [30010]],
      [2, 0, true, [9990]],
    ]);
  });
});

describe("import d'une police PDF", () => {
  let db: Db;
  let adult: number;
  let kid: number;
  beforeAll(async () => {
    db = openDb(":memory:");
    await importPremiumFile(db, path.join(FIXTURES_DIR, "primes-2026.xlsx"), "test");
    saveHousehold(db, { name: "Famille Test", street: "Rue du Lac 1", postalCode: "1003", city: "Lausanne", canton: "VD", region: 1 });
    adult = savePerson(db, 1, { firstName: "Alex", lastName: "Test", birthDate: "1988-04-12", healthCostsRp: 50000 });
    kid = savePerson(db, 1, { firstName: "Lou", lastName: "Test", birthDate: "2016-06-30", kidSubgroup: "K1", healthCostsRp: 30000 });
  });

  async function policyPdf(lines: string[]): Promise<Uint8Array> {
    const doc = React.createElement(Document, null, React.createElement(Page, { size: "A4" }, ...lines.map((l, i) => React.createElement(Text, { key: i }, l))));
    return new Uint8Array(await renderToBuffer(doc));
  }

  it("retrouve la caisse, l'année et le tarif exact de chaque membre", async () => {
    const hel = listInsurers(db).find((i) => i.bagNumber === 1562)!.id;
    const tel = tariffOptions(db, adult, 2026, hel).tariffs.find((t) => t.modelType === "TELMED")!;
    const adultPremium = tel.premiums[2500]![0]!;
    const base = tariffOptions(db, kid, 2026, hel).tariffs.find((t) => t.modelType === "STANDARD")!;
    const kidPremium = base.premiums[0]![1]!;

    const pdf = await policyPdf([
      "Helsana Assurances SA",
      "Police d'assurance 2026 – valable dès le 01.01.2026",
      "N° de police : 77.123.456",
      `Alex Test, né le 12.04.1988 · Assurance obligatoire des soins LAMal · franchise CHF 2'500 · sans couverture accidents · prime mensuelle ${formatChf(adultPremium, { currency: false })}`,
      "Assurances complémentaires LCA : Hospitalisation demi-privée CHF 64.20",
      `Lou Test, née le 30.06.2016 · LAMal · franchise CHF 0 · avec accidents · ${formatChf(kidPremium, { currency: false })}`,
    ]);
    const text = await readPdfText(pdf);
    const res = analyzePolicyText(db, text, 2026);
    expect(res.insurerId).toBe(hel);
    expect(res.year).toBe(2026);
    expect(res.warnings).toEqual([]);
    const [a, k] = res.persons;
    expect(a).toMatchObject({ personId: adult, matched: true, tariffCode: tel.code, franchiseChf: 2500, accident: false, billedMonthlyRp: adultPremium, policyNumber: "77.123.456" });
    expect(a!.lca).toEqual([{ guarantee: "HOSPITAL_SEMI_PRIVATE", label: "Hospitalisation demi-privée", monthlyRp: 6420 }]);
    expect(k).toMatchObject({ personId: kid, matched: true, tariffCode: base.code, franchiseChf: 0, accident: true, billedMonthlyRp: kidPremium });

    applyPolicyImport(db, {
      insurerId: hel,
      year: 2026,
      persons: res.persons.map((p) => ({ ...p, franchiseChf: p.franchiseChf!, billedMonthlyRp: p.billedMonthlyRp! })),
    });
    applyPolicyImport(db, { insurerId: hel, year: 2026, persons: res.persons.map((p) => ({ ...p, franchiseChf: p.franchiseChf!, billedMonthlyRp: p.billedMonthlyRp! })) });
    expect(listPolicies(db, adult).map((x) => [x.policy.coverageYear, x.policy.tariffCode])).toEqual([[2026, tel.code]]);
    expect(listLca(db, adult)).toHaveLength(1);
  });

  it("refuse un PDF sans texte", async () => {
    const pdf = await policyPdf([" "]);
    expect(() => analyzePolicyText(db, "", 2026)).toThrow(/scanné/);
    expect((await readPdfText(pdf)).trim()).toBe("");
  });
});
