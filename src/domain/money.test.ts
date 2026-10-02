import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { changePermille, formatChf, formatPermille, parseChf, roundTo5 } from "./money";

describe("money", () => {
  it("parse les formats suisses", () => {
    expect(parseChf("432.10")).toBe(43210);
    expect(parseChf("432,1")).toBe(43210);
    expect(parseChf("1'234.50")).toBe(123450);
    expect(parseChf("1’234.50")).toBe(123450);
    expect(parseChf("CHF 12")).toBe(1200);
    expect(parseChf(389.95)).toBe(38995);
    expect(parseChf("-5.05")).toBe(-505);
    expect(() => parseChf("12.345")).toThrow();
    expect(() => parseChf("abc")).toThrow();
  });

  it("évite les erreurs de float", () => {
    expect(parseChf(0.1 + 0.2)).toBe(30);
    expect(parseChf(1.005)).toBe(101);
  });

  it("formate de façon déterministe", () => {
    expect(formatChf(123450)).toBe("CHF 1’234.50");
    expect(formatChf(-505)).toBe("CHF −5.05");
    expect(formatChf(4820, { signed: true })).toBe("CHF +48.20");
    expect(formatChf(123456, { whole: true })).toBe("CHF 1’235");
    expect(formatChf(5, { currency: false })).toBe("0.05");
  });

  it("aller-retour format/parse", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (rp) => {
        expect(parseChf(formatChf(rp))).toBe(rp);
      }),
    );
  });

  it("arrondit aux 5 centimes", () => {
    expect(roundTo5(12342)).toBe(12340);
    expect(roundTo5(12343)).toBe(12345);
  });

  it("calcule les variations en pour-mille", () => {
    expect(changePermille(40000, 42960)).toBe(74);
    expect(formatPermille(74)).toBe("+7.4 %");
    expect(formatPermille(-12)).toBe("−1.2 %");
    expect(changePermille(0, 100)).toBeNull();
  });
});
