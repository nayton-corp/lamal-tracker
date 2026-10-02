import { describe, expect, it } from "vitest";
import { bestPerInsurer, rankOffers, type Offer } from "@/domain/comparison";
import { annualGrowthPermille, buildProfiles, median, tercile } from "@/domain/insurer-profile";
import { defaultParameters } from "@/domain/parameters";

describe("portrait des caisses", () => {
  it("calcule une hausse annuelle moyenne composée", () => {
    expect(annualGrowthPermille(new Map([[2025, 10000], [2027, 12100]]))).toEqual({ fromYear: 2025, toYear: 2027, permille: 100 });
    expect(annualGrowthPermille(new Map([[2027, 10000]]))).toBeNull();
  });

  it("situe une valeur dans le marché", () => {
    const values = [1, 2, 3, 4, 5, 6];
    expect(tercile(1, values)).toBe("LOW");
    expect(tercile(3, values)).toBe("MID");
    expect(tercile(6, values)).toBe("HIGH");
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });

  it("exprime les réserves en mois de primes et compare l'évolution au marché", () => {
    const figures = [1, 2, 3].map((id) => ({
      insurerId: id,
      year: 2024,
      insured: id * 1000,
      premiumPerInsuredRp: 400_000,
      adminPerInsuredRp: id * 10_000,
      reservesPerInsuredRp: id * 50_000,
    }));
    const series = new Map([
      [1, new Map([[2023, 10000], [2027, 12000]])],
      [2, new Map([[2023, 10000], [2027, 14000]])],
      [3, new Map([[2023, 10000], [2027, 17000]])],
    ]);
    const p = buildProfiles(figures, series);
    expect(p.get(1)).toMatchObject({ insured: 1000, reservesMonths: 1.5, reservesLevel: "LOW", adminLevel: "LOW", trendLevel: "BETTER" });
    expect(p.get(2)).toMatchObject({ reservesMonths: 3, trendLevel: "SIMILAR" });
    expect(p.get(3)).toMatchObject({ reservesMonths: 4.5, reservesLevel: "HIGH", trendLevel: "WORSE" });
    expect(p.get(2)!.trend).toEqual({ fromYear: 2023, toYear: 2027, insurerPermille: 88, marketPermille: 88 });
  });
});

describe("une offre par caisse", () => {
  it("garde la meilleure offre de chaque caisse et renumérote", () => {
    const offer = (insurerId: number, code: string, monthlyPremiumRp: number): Offer => ({
      tariffId: monthlyPremiumRp,
      insurerId,
      insurerName: `Caisse ${insurerId}`,
      tariffCode: code,
      tariffLabel: code,
      modelType: "STANDARD",
      franchiseChf: 300,
      accident: false,
      monthlyPremiumRp,
    });
    const ranked = rankOffers([offer(1, "A", 30000), offer(1, "B", 28000), offer(2, "C", 29000)], {
      ageClass: "ADULT",
      params: defaultParameters(2027, 5700),
      healthCostsRp: 0,
      referenceTotalRp: null,
    }, "premium");
    expect(bestPerInsurer(ranked).map((o) => [o.rank, o.tariffCode])).toEqual([[1, "B"], [2, "C"]]);
  });
});
