import { describe, expect, it } from "vitest";
import { PINGEN_UNKNOWN, pingenBlockers, pingenFailed, pingenNeedsSync, pingenPhase } from "./pingen";

describe("statut Pingen", () => {
  it("classe les statuts, et un statut inconnu reste en cours", () => {
    expect(pingenPhase("validating")).toBe("PENDING");
    expect(pingenPhase("processing")).toBe("PENDING");
    expect(pingenPhase("un_statut_futur")).toBe("PENDING");
    expect(pingenPhase("sent")).toBe("IN_TRANSIT");
    expect(pingenPhase("delivered")).toBe("DELIVERED");
    expect(pingenPhase("action_required")).toBe("FAILED");
    expect(pingenPhase("undeliverable")).toBe("FAILED");
    expect(pingenPhase(PINGEN_UNKNOWN)).toBe("UNCONFIRMED");
  });

  it("ne suit plus une lettre distribuée ou refusée", () => {
    expect(pingenNeedsSync(null)).toBe(false);
    expect(pingenNeedsSync("sent")).toBe(true);
    expect(pingenNeedsSync(PINGEN_UNKNOWN)).toBe(true);
    expect(pingenNeedsSync("delivered")).toBe(false);
    expect(pingenNeedsSync("invalid")).toBe(false);
    expect(pingenFailed("invalid")).toBe(true);
    expect(pingenFailed("sent")).toBe(false);
    expect(pingenFailed(null)).toBe(false);
  });
});

describe("conditions d'envoi par Pingen", () => {
  const content = { signatures: ["Alex Test", "Sam Test"], insurerLines: ["Helsana Assurances SA", "Case postale", "8081 Zurich"] };

  it("exige la signature à l'écran de chaque signataire", () => {
    expect(pingenBlockers(content, ["Alex Test"])).toEqual(["Signature à l'écran manquante : Sam Test."]);
    expect(pingenBlockers(content, ["Alex Test", "Sam Test"])).toEqual([]);
  });

  it("refuse une adresse trop longue pour la fenêtre", () => {
    const long = { ...content, insurerLines: ["a", "b", "c", "d", "e", "f", "g"] };
    expect(pingenBlockers(long, ["Alex Test", "Sam Test"])).toEqual([expect.stringMatching(/7 lignes/)]);
  });
});
