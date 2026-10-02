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
