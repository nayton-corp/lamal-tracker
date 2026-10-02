import { describe, expect, it } from "vitest";
import { lookupPostalCode } from "@/infrastructure/regions/postal";

describe("région par code postal", () => {
  it("code postal d'une seule commune", () => {
    expect(lookupPostalCode("1003")).toEqual([{ commune: "Lausanne", bfs: 5586, canton: "VD", region: 1, localities: ["Lausanne"], share: 100 }]);
    expect(lookupPostalCode("8400")[0]).toMatchObject({ commune: "Winterthur", canton: "ZH", region: 2 });
  });

  it("plusieurs communes : la plus probable d'abord", () => {
    const options = lookupPostalCode("1053");
    expect(options.length).toBeGreaterThan(1);
    expect(options[0]!.share).toBeGreaterThanOrEqual(options[1]!.share);
    expect(new Set(options.map((o) => o.region)).size).toBeGreaterThan(1);
  });

  it("refuse un code invalide", () => {
    expect(lookupPostalCode("12")).toEqual([]);
    expect(lookupPostalCode("0000")).toEqual([]);
  });
});
