import { describe, expect, it } from "vitest";
import { slugify } from "./text";

describe("slugify", () => {
  it("retire les accents sans couper le mot", () => {
    expect(slugify("Sénévita Assurances")).toBe("senevita-assurances");
  });
  it("limite la longueur sans tiret final", () => {
    expect(slugify("a".repeat(39) + " b", 40)).toBe("a".repeat(39));
  });
});
