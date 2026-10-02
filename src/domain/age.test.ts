import { describe, expect, it } from "vitest";
import { ageClassForYear, ageTransition, isMinorOn } from "./age";

describe("classe d'âge", () => {
  it("dépend de l'année de naissance seulement", () => {
    expect(ageClassForYear("2008-12-31", 2026)).toBe("KID"); // 18 ans dans l'année
    expect(ageClassForYear("2008-01-01", 2027)).toBe("YOUNG"); // 19
    expect(ageClassForYear("2001-06-15", 2026)).toBe("YOUNG"); // 25
    expect(ageClassForYear("2001-06-15", 2027)).toBe("ADULT"); // 26
  });

  it("signale les transitions", () => {
    expect(ageTransition("2008-05-01", 2027)?.to).toBe("YOUNG");
    expect(ageTransition("2001-05-01", 2027)?.to).toBe("ADULT");
    expect(ageTransition("1985-05-01", 2027)).toBeNull();
  });

  it("refuse les dates impossibles", () => {
    expect(() => ageClassForYear("abcd", 2027)).toThrow();
    expect(() => ageClassForYear("2030-01-01", 2027)).toThrow();
  });

  it("mineur ou non à une date complète", () => {
    expect(isMinorOn("2008-12-15", "2026-11-20")).toBe(true); // 17 ans, 18 en décembre
    expect(isMinorOn("2008-11-20", "2026-11-20")).toBe(false); // jour des 18 ans
    expect(isMinorOn("2008-11-21", "2026-11-20")).toBe(true); // la veille
    expect(isMinorOn("2008-02-29", "2026-02-28")).toBe(true);
    expect(isMinorOn("2008-02-29", "2026-03-01")).toBe(false);
    expect(isMinorOn("1988-04-12", "2026-11-20")).toBe(false);
    expect(() => isMinorOn("abcd", "2026-11-20")).toThrow();
  });
});
