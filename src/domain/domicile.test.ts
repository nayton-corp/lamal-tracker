import { describe, expect, it } from "vitest";
import { domicileLabel, sameDomicile, samePremiumRegion } from "./domicile";

const fribourg = { commune: "Fribourg", bfsNumber: 2196, canton: "FR", region: 1 };
const marly = { commune: "Marly", bfsNumber: 2206, canton: "FR", region: 1 };
const sion = { commune: "Sion", bfsNumber: 6266, canton: "VS", region: 1 };

describe("domicile", () => {
  it("compare la région de primes, puis la commune", () => {
    expect(samePremiumRegion(fribourg, marly)).toBe(true);
    expect(sameDomicile(fribourg, marly)).toBe(false);
    expect(samePremiumRegion(fribourg, sion)).toBe(false);
    expect(sameDomicile(fribourg, { ...fribourg })).toBe(true);
  });

  it("affiche la commune, sinon le canton et la région", () => {
    expect(domicileLabel(sion)).toBe("Sion (VS)");
    expect(domicileLabel({ commune: "", bfsNumber: null, canton: "GE", region: 0 })).toBe("GE, région 0");
  });
});
