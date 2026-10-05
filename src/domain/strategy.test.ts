import { describe, expect, it } from "vitest";
import { isReviewWindowOpen } from "./deadlines";
import { qualityPoints, strategyDefaults, usageFor, USAGE_INFO } from "./strategy";

describe("stratégies", () => {
  it("propose des réglages par défaut selon la stratégie", () => {
    const current = { modelType: "PRAXIS" as const, franchiseChf: 1500 };
    expect(strategyDefaults("KEEP", current)).toEqual({ franchiseChf: 1500, models: ["PRAXIS"] });
    expect(strategyDefaults("ECONOMY", current)).toEqual({ franchiseChf: null, models: [] });
  });

  it("compte les points de solidité d'une caisse", () => {
    expect(qualityPoints(null)).toBe(0);
    expect(qualityPoints({ reservesLevel: "HIGH", adminLevel: "LOW", trendLevel: "BETTER" })).toBe(3);
    expect(qualityPoints({ reservesLevel: "LOW", adminLevel: "HIGH", trendLevel: "WORSE" })).toBe(-3);
    expect(qualityPoints({ reservesLevel: "MID", adminLevel: null, trendLevel: "SIMILAR" })).toBe(0);
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
