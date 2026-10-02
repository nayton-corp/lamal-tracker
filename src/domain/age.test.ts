import { describe, expect, it } from "vitest";
import { ageClassForYear, ageTransition } from "./age";

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
});
