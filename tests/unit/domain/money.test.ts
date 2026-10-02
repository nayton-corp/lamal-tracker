import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { chfToRappen, formatChf, formatPercentBp, relativeChangeBp, roundTo5 } from "@/domain/money";

describe("chfToRappen", () => {
  it.each([
    ["351.40", 35140],
    ["351.4", 35140],
    ["1'234.55", 123455],
    ["1 234,55", 123455],
    ["1 234.55", 123455],
    ["CHF 12.30", 1230],
    ["12.30 CHF", 1230],
    ["0", 0],
    [".5", 50],
    ["-4.20", -420],
    ["1.005", 101],
    ["2,5", 250],
    ["1,234.50", 123450],
  ])("%s → %i", (input, expected) => {
    expect(chfToRappen(input)).toBe(expected);
  });

  it("convertit les nombres sans erreur d'arrondi binaire", () => {
    expect(chfToRappen(1.005)).toBe(101);
    expect(chfToRappen(0.1 + 0.2)).toBe(30);
    expect(chfToRappen(351.4)).toBe(35140);
    expect(chfToRappen(-12.345)).toBe(-1235);
  });

  it.each(["", "abc", "12.3.4", "CHF", "-"])("refuse « %s »", (input) => {
    expect(() => chfToRappen(input)).toThrow();
  });

  it("aller-retour : formater puis relire redonne le même montant", () => {
    fc.assert(
      fc.property(fc.integer({ min: -10_000_000, max: 10_000_000 }), (rp) => {
        expect(chfToRappen(formatChf(rp, { currency: false }).replace("−", "-"))).toBe(rp);
      }),
    );
  });
});

describe("formatChf", () => {
  it("formate à la suisse romande", () => {
    expect(formatChf(123450)).toBe("CHF 1 234.50");
    expect(formatChf(-4820, { signed: true })).toBe("−CHF 48.20");
    expect(formatChf(4820, { signed: true })).toBe("+CHF 48.20");
    expect(formatChf(41200, { compact: true })).toBe("CHF 412");
    expect(formatChf(0, { signed: true })).toBe("CHF 0.00");
  });
});

describe("roundTo5", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 5],
    [7, 5],
    [8, 10],
    [12345, 12345],
    [12347, 12345],
    [12348, 12350],
    [-3, -5],
  ])("%i → %i", (input, expected) => {
    expect(roundTo5(input)).toBe(expected);
  });

  it("donne toujours un multiple de 5 à moins de 2.5 centimes", () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (rp) => {
        const r = roundTo5(rp);
        expect(Math.abs(r % 5)).toBe(0);
        expect(Math.abs(r - rp)).toBeLessThanOrEqual(2);
      }),
    );
  });
});

describe("pourcentages", () => {
  it("calcule la variation en points de base", () => {
    expect(relativeChangeBp(40000, 42960)).toBe(740);
    expect(relativeChangeBp(0, 100)).toBeNull();
    expect(formatPercentBp(740)).toBe("+7.4 %");
    expect(formatPercentBp(-35)).toBe("−0.4 %");
  });
});
