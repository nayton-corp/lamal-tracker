import { describe, expect, it } from "vitest";
import { findRenewal, nearestFranchise } from "./renewal";
import type { Offer } from "./comparison";

const o = (tariffId: number, tariffCode: string, franchiseChf: number, modelType: Offer["modelType"] = "STANDARD", insurerId = 1): Offer => ({
  tariffId, insurerId, insurerName: "X", tariffCode, tariffLabel: tariffCode, modelType, franchiseChf, accident: false, monthlyPremiumRp: 30000 + tariffId,
});

const adult = [300, 500, 1000, 1500, 2000, 2500];

describe("renouvellement", () => {
  const contract = { insurerId: 1, tariffCode: "TEL-A", modelType: "TELMED" as const, franchiseChf: 2500 };

  it("retrouve le tarif par code", () => {
    const r = findRenewal(contract, [o(1, "TEL-A", 2500, "TELMED"), o(2, "TEL-A", 300, "TELMED")], adult);
    expect(r.status).toBe("MATCHED");
    expect(r.offer?.tariffId).toBe(1);
  });

  it("code renommé, un seul tarif du même modèle : probable", () => {
    const r = findRenewal(contract, [o(1, "TEL-B", 2500, "TELMED"), o(2, "BASE", 2500)], adult);
    expect(r.status).toBe("PROBABLE");
    expect(r.offer?.tariffCode).toBe("TEL-B");
  });

  it("plusieurs candidats : ambigu, sans choix arbitraire", () => {
    const r = findRenewal(contract, [o(1, "TEL-B", 2500, "TELMED"), o(2, "TEL-C", 2500, "TELMED")], adult);
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.offer).toBeNull();
    expect(r.alternatives).toHaveLength(2);
  });

  it("lignée confirmée prioritaire", () => {
    const r = findRenewal(contract, [o(1, "TEL-B", 2500, "TELMED"), o(2, "TEL-C", 2500, "TELMED")], adult, "TEL-C");
    expect(r.status).toBe("MATCHED");
    expect(r.offer?.tariffCode).toBe("TEL-C");
  });

  it("enfant qui devient jeune adulte : franchise ajustée", () => {
    const kid = { insurerId: 1, tariffCode: "BASE", modelType: "STANDARD" as const, franchiseChf: 0 };
    const r = findRenewal(kid, [o(1, "BASE", 300), o(2, "BASE", 2500)], adult);
    expect(r.franchiseAdjusted).toBe(true);
    expect(r.franchiseChf).toBe(300);
    expect(r.status).toBe("MATCHED");
  });

  it("assureur disparu : manquant", () => {
    expect(findRenewal(contract, [o(1, "TEL-A", 2500, "TELMED", 9)], adult).status).toBe("MISSING");
  });

  it("franchise la plus proche", () => {
    expect(nearestFranchise(600, adult)).toBe(500);
    expect(nearestFranchise(400, adult)).toBe(300);
  });
});

describe("renouvellement sur des cas réels 2026 → 2027", () => {
  const offer = (code: string, label: string, modelType: Offer["modelType"], tariffId = Math.floor(Math.random() * 1e6)): Offer => ({
    tariffId, insurerId: 1, insurerName: "X", tariffCode: code, tariffLabel: label, modelType, franchiseChf: 300, accident: false, monthlyPremiumRp: 40000 + tariffId % 100,
  });
  const contract = (code: string, label: string, modelType: Offer["modelType"]) => ({ insurerId: 1, tariffCode: code, tariffLabel: label, modelType, franchiseChf: 300 });

  const swica = [
    offer("BASE", "BASE", "STANDARD"),
    offer("Bestcare (BESTCARE)", "Favorit Bestcare", "PRAXIS"),
    offer("Casa", "Favorit Casa", "PRAXIS"),
    offer("Favorit Start", "Favorit Start", "PRAXIS"),
    offer("Medica (MEDICA)", "Favorit Medica", "PRAXIS"),
    offer("Medpharm (PHARMA)", "Favorit Medpharm", "PHARMACY"),
    offer("Multichoice (MULTICHOICE)", "Favorit Multichoice", "FLEX"),
    offer("Santé (HMO)", "Favorit Santé", "PRAXIS"),
    offer("Telmed", "Favorit Telmed", "TELMED"),
  ];

  it.each([
    ["CASA", "FAVORIT CASA", "PRAXIS", "Casa"],
    ["BESTCARE", "FAVORIT BESTCARE", "PRAXIS", "Bestcare (BESTCARE)"],
    ["HMO", "FAVORIT SANTE", "PRAXIS", "Santé (HMO)"],
    ["PHARMA", "FAVORIT MEDPHARM", "PRAXIS", "Medpharm (PHARMA)"],
    ["TELMED", "FAVORIT TELMED", "TELMED", "Telmed"],
    ["MULTICHOICE", "FAVORIT MULTICHOICE", "PRAXIS", "Multichoice (MULTICHOICE)"],
  ] as const)("SWICA %s → %s", (code, label, model, expected) => {
    const r = findRenewal(contract(code, label, model), swica, adult);
    expect(r.status).toBe("MATCHED");
    expect(r.offer?.tariffCode).toBe(expected);
  });

  it("Sanitas : nouveau code qui prolonge l'ancien", () => {
    const sanitas = [
      offer("Hausarztmodell 1 (NetMed 1)", "Hausarztmodell 1", "PRAXIS"),
      offer("Hausarztmodell 2 (NetMed 2)", "Hausarztmodell 2", "PRAXIS"),
      offer("TelMed Basic", "TelMed Basic", "TELMED"),
      offer("TelMed Plus", "TelMed Plus", "TELMED"),
    ];
    expect(findRenewal(contract("Hausarztmodell 2", "Hausarztmodell 2", "PRAXIS"), sanitas, adult).offer?.tariffCode).toBe("Hausarztmodell 2 (NetMed 2)");
    // Deux Telmed possibles, rien ne permet de trancher : on demande.
    expect(findRenewal(contract("TelMed (CallMed)", "TelMed (CallMed)", "TELMED"), sanitas, adult).status).toBe("AMBIGUOUS");
  });

  it("Helsana : même nom commercial, autre code", () => {
    const helsana = [
      offer("BFP_CA", "Helsana BeneFit PLUS Hausarzt R3", "PRAXIS"),
      offer("BFP_CPF", "Helsana BeneFit PLUS Flexmed", "FLEX"),
      offer("BFP_TEL", "Helsana BeneFit PLUS Telemed", "TELMED"),
    ];
    const r = findRenewal(contract("BFP_CAF", "BeneFit PLUS Flexmed R3", "PRAXIS"), helsana, adult);
    expect(r.status).toBe("PROBABLE");
    expect(r.offer?.tariffCode).toBe("BFP_CPF");
  });

  it("casse différente : TelMed → Telmed", () => {
    const okk = [offer("Telmed", "ÖKK CASAMED 24", "TELMED"), offer("BASE", "BASE", "STANDARD")];
    expect(findRenewal(contract("TelMed", "Telemedizin", "TELMED"), okk, adult).status).toBe("MATCHED");
  });

  it("caisse disparue : aucune offre", () => {
    expect(findRenewal(contract("BASE", "Grundversicherung", "STANDARD"), [], adult).status).toBe("MISSING");
  });
});
