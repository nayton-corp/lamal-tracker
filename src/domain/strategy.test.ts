import { describe, expect, it } from "vitest";
import type { RankedOffer } from "./comparison";
import { isReviewWindowOpen } from "./deadlines";
import { balanceScoreRp, qualityPoints, rankForStrategy, strategyDefaults, usageFor, USAGE_INFO } from "./strategy";

const offer = (insurerId: number, totalRp: number, monthly = totalRp / 12): RankedOffer => ({
  tariffId: insurerId,
  insurerId,
  insurerName: `Caisse ${insurerId}`,
  tariffCode: `T${insurerId}`,
  tariffLabel: "Telmed",
  modelType: "TELMED",
  franchiseChf: 2500,
  accident: false,
  monthlyPremiumRp: Math.round(monthly),
  rank: 0,
  cost: { grossPremiumRp: totalRp, co2Rp: 0, netPremiumRp: totalRp, franchisePartRp: 0, coinsurancePartRp: 0, totalRp },
  savingsRp: null,
  doctorCheck: false,
});

describe("stratégies", () => {
  it("propose des réglages par défaut selon la stratégie", () => {
    const current = { modelType: "PRAXIS" as const, franchiseChf: 1500 };
    expect(strategyDefaults("KEEP", current)).toEqual({ franchiseChf: 1500, models: ["PRAXIS"] });
    expect(strategyDefaults("ECONOMY", current)).toEqual({ franchiseChf: null, models: [] });
    expect(strategyDefaults("BALANCE", current)).toEqual({ franchiseChf: null, models: null });
  });

  it("compte les points de solidité d'une caisse", () => {
    expect(qualityPoints(null)).toBe(0);
    expect(qualityPoints({ reservesLevel: "HIGH", adminLevel: "LOW", trendLevel: "BETTER" })).toBe(3);
    expect(qualityPoints({ reservesLevel: "LOW", adminLevel: "HIGH", trendLevel: "WORSE" })).toBe(-3);
    expect(qualityPoints({ reservesLevel: "MID", adminLevel: null, trendLevel: "SIMILAR" })).toBe(0);
  });

  it("l'équilibre préfère une caisse solide un peu plus chère, pas beaucoup plus chère", () => {
    const cheap = offer(1, 400_000);
    const solid = offer(2, 420_000);
    const pricey = offer(3, 480_000);
    const quality = (id: number) => (id === 1 ? -1 : id === 2 ? 2 : 3);
    // 400 000 × 1,03 = 412 000 ; 420 000 × 0,94 = 394 800 ; 480 000 × 0,91 = 436 800
    expect(balanceScoreRp(400_000, -1)).toBe(412_000);
    expect(rankForStrategy([cheap, solid, pricey], "BALANCE", quality).map((o) => [o.insurerId, o.rank])).toEqual([[2, 1], [1, 2], [3, 3]]);
    expect(rankForStrategy([solid, pricey, cheap], "ECONOMY", quality).map((o) => o.insurerId)).toEqual([1, 2, 3]);
  });

  it("traduit un profil de consommation en frais et inversement", () => {
    expect(usageFor(USAGE_INFO.FEW.healthCostsRp)).toBe("FEW");
    expect(usageFor(123_400)).toBeNull();
  });

  it("ouvre la fenêtre du rituel de la publication au 30 novembre", () => {
    expect(isReviewWindowOpen("2026-10-05", 2027, true)).toBe(true);
    expect(isReviewWindowOpen("2026-10-05", 2027, false)).toBe(false);
    expect(isReviewWindowOpen("2026-11-30", 2027, true)).toBe(true);
    expect(isReviewWindowOpen("2026-12-01", 2027, true)).toBe(false);
  });
});
