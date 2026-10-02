import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { annualCost, breakEvenRp, franchiseCurve } from "./cost";

const base = { coinsuranceRateBp: 1000, coinsuranceMaxRp: 70000, co2AnnualRp: 5700 };

describe("coût annuel", () => {
  it("calcule un cas fait à la main", () => {
    // Prime 400.00, franchise 300, frais 2000 : 4800 − 57 + 300 + min(170, 700) = 5213
    const c = annualCost({ ...base, monthlyPremiumRp: 40000, franchiseChf: 300, healthCostsRp: 200000 });
    expect(c.grossPremiumRp).toBe(480000);
    expect(c.netPremiumRp).toBe(474300);
    expect(c.franchisePartRp).toBe(30000);
    expect(c.coinsurancePartRp).toBe(17000);
    expect(c.totalRp).toBe(521300);
  });

  it("plafonne la quote-part", () => {
    const c = annualCost({ ...base, monthlyPremiumRp: 30000, franchiseChf: 2500, healthCostsRp: 5_000_000 });
    expect(c.franchisePartRp).toBe(250000);
    expect(c.coinsurancePartRp).toBe(70000);
  });

  it("CO2 inconnu = 0", () => {
    const c = annualCost({ ...base, co2AnnualRp: null, monthlyPremiumRp: 100, franchiseChf: 0, healthCostsRp: 0 });
    expect(c.totalRp).toBe(1200);
  });

  it("le coût ne baisse jamais quand les frais augmentent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 150000 }),
        fc.constantFrom(0, 300, 500, 1000, 2500),
        fc.integer({ min: 0, max: 3_000_000 }),
        fc.integer({ min: 0, max: 100000 }),
        (premium, franchise, h, delta) => {
          const a = annualCost({ ...base, monthlyPremiumRp: premium, franchiseChf: franchise, healthCostsRp: h });
          const b = annualCost({ ...base, monthlyPremiumRp: premium, franchiseChf: franchise, healthCostsRp: h + delta });
          expect(b.totalRp).toBeGreaterThanOrEqual(a.totalRp);
          expect(b.totalRp - a.totalRp).toBeLessThanOrEqual(delta);
        },
      ),
    );
  });

  it("trouve le point de bascule entre franchises", () => {
    const options = [
      { franchiseChf: 300, monthlyPremiumRp: 45000 },
      { franchiseChf: 2500, monthlyPremiumRp: 32000 },
    ];
    // Écart de primes : 1560/an. À frais h ≥ 2500 : 300-option paie 300 + 0.1(h−300) plafonné ; 2500-option paie 2500 + 0.1(h−2500)
    const be = breakEvenRp(options, base);
    expect(be).not.toBeNull();
    const curve = franchiseCurve(options, base, 600000, 10000);
    expect(curve[0]!.bestFranchiseChf).toBe(2500);
    expect(curve.at(-1)!.bestFranchiseChf).toBe(300);
    // Au point trouvé, la franchise basse gagne ; 1 franc avant, non.
    const at = (h: number) =>
      options.map((o) => annualCost({ ...base, ...o, healthCostsRp: h }).totalRp);
    const [low, high] = at(be!);
    expect(low!).toBeLessThanOrEqual(high!);
    const [lowBefore, highBefore] = at(be! - 100);
    expect(lowBefore!).toBeGreaterThan(highBefore!);
  });
});
