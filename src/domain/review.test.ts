import { describe, expect, it } from "vitest";
import { checkLetter } from "./review";
import { buildLetter } from "./letter";

const line = {
  decision: "SWITCH" as const,
  currentInsurerId: 1,
  chosenInsurerId: 2,
  insurerHasAddress: true,
  policyNumber: "123",
  affiliationRequestedAt: "2026-10-01",
};

describe("garde-fous", () => {
  it("autorise une résiliation complète", () => {
    expect(checkLetter(line)).toEqual({ allowed: true, blockers: [], warnings: [] });
  });

  it("bloque un faux changement et une adresse manquante", () => {
    expect(checkLetter({ ...line, chosenInsurerId: 1 }).allowed).toBe(false);
    expect(checkLetter({ ...line, insurerHasAddress: false }).allowed).toBe(false);
    expect(checkLetter({ ...line, decision: "KEEP" }).allowed).toBe(false);
  });

  it("avertit sans bloquer", () => {
    const c = checkLetter({ ...line, policyNumber: null, affiliationRequestedAt: null });
    expect(c.allowed).toBe(true);
    expect(c.warnings).toHaveLength(2);
  });
});

describe("lettre", () => {
  it("résiliation : LAMal seule, LCA explicitement maintenue", () => {
    const l = buildLetter({
      kind: "TERMINATION",
      senderLines: ["Nathan Exemple", "Rue 1", "1000 Lausanne"],
      insurerLines: ["Caisse SA", "Case postale", "3000 Berne"],
      place: "Lausanne",
      date: "2026-10-10",
      effectiveEnd: "2026-12-31",
      targetYear: 2027,
      persons: [
        { fullName: "Nathan Exemple", birthDate: "1990-02-01", policyNumber: "A1", isMinor: false },
        { fullName: "Léa Exemple", birthDate: "2015-03-01", policyNumber: null, isMinor: true },
      ],
    });
    expect(l.subject).toBe("Résiliation de l'assurance obligatoire des soins (LAMal) au 31 décembre 2026");
    expect(l.lcaClause).toMatch(/ne sont pas résiliées/);
    expect(l.personRows[0]).toBe("Nathan Exemple, né·e le 1er février 1990, n° d'assuré A1");
    expect(l.signatures).toEqual(["Nathan Exemple"]);
    expect(l.placeAndDate).toBe("Lausanne, le 10 octobre 2026");
  });
});
