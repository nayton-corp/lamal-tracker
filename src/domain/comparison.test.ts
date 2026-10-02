import { describe, expect, it } from "vitest";
import { cheapestPerFranchise, filterOffers, marketStats, percentileOf, rankOffers, type Offer } from "./comparison";
import { defaultParameters } from "./parameters";

function offer(p: Partial<Offer> & Pick<Offer, "tariffId" | "monthlyPremiumRp">): Offer {
  return {
    insurerId: p.tariffId,
    insurerName: `Caisse ${p.tariffId}`,
    tariffCode: `T${p.tariffId}`,
    tariffLabel: "Tarif",
    modelType: "STANDARD",
    franchiseChf: 2500,
    accident: false,
    ...p,
  };
}

const params = defaultParameters(2027);

describe("comparaison", () => {
  const offers = [
    offer({ tariffId: 1, monthlyPremiumRp: 35000 }),
    offer({ tariffId: 2, monthlyPremiumRp: 30000, modelType: "TELMED" }),
    offer({ tariffId: 3, monthlyPremiumRp: 45000, franchiseChf: 300 }),
    offer({ tariffId: 4, monthlyPremiumRp: 30000, modelType: "PRAXIS", insurerName: "Aaa" }),
  ];

  it("classe par coût total et calcule l'économie", () => {
    const ranked = rankOffers(offers, { ageClass: "ADULT", params, healthCostsRp: 0, referenceTotalRp: 35000 * 12 - 5700 });
    expect(ranked.map((o) => o.tariffId)).toEqual([4, 2, 1, 3]);
    expect(ranked[0]!.savingsRp).toBe(60000);
    expect(ranked[0]!.doctorCheck).toBe(true);
    expect(ranked[1]!.doctorCheck).toBe(false);
    expect(ranked.map((o) => o.rank)).toEqual([1, 2, 3, 4]);
  });

  it("avec de gros frais, la franchise basse remonte", () => {
    const ranked = rankOffers(offers, { ageClass: "ADULT", params, healthCostsRp: 1_000_000, referenceTotalRp: null });
    expect(ranked[0]!.tariffId).toBe(3);
    expect(ranked[0]!.savingsRp).toBeNull();
  });

  it("filtre par modèle, franchise et assureur exclu", () => {
    expect(filterOffers(offers, { models: ["TELMED"] }).map((o) => o.tariffId)).toEqual([2]);
    expect(filterOffers(offers, { franchises: [300] }).map((o) => o.tariffId)).toEqual([3]);
    expect(filterOffers(offers, { excludedInsurerIds: [1, 2] }).map((o) => o.tariffId)).toEqual([3, 4]);
  });

  it("donne la meilleure prime par franchise", () => {
    expect(cheapestPerFranchise(offers).map((o) => [o.franchiseChf, o.monthlyPremiumRp])).toEqual([
      [300, 45000],
      [2500, 30000],
    ]);
  });

  it("statistiques de marché", () => {
    expect(marketStats([3, 1, 2, 10])).toEqual({ count: 4, minRp: 1, medianRp: 3, maxRp: 10 });
    expect(percentileOf(3, [1, 2, 3, 4])).toBe(50);
    expect(marketStats([])).toBeNull();
  });
});
