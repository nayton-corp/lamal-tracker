import { describe, expect, it } from "vitest";
import { earliestLcaTermination, lcaWarningsForSwitch, type LcaPolicy } from "@/domain/lca";
import {
  canGenerateTerminationLetter,
  deriveReviewStatus,
  inferDecision,
  premiumChange,
  ritualSteps,
  validateDecision,
  type ReviewLineState,
} from "@/domain/review";
import { buildTerminationLetter } from "@/domain/termination-letter";

const switching: ReviewLineState = {
  decision: "SWITCH",
  chosenTariffId: 12,
  chosenInsurerId: 1542,
  currentInsurerId: 8,
  lcaAckAt: "2026-10-10T10:00:00Z",
  activeLcaCount: 1,
  doctorCheck: "UNKNOWN",
  requiresDoctorCheck: false,
};

describe("invariant de la lettre de résiliation", () => {
  it("autorise un changement validé", () => {
    expect(canGenerateTerminationLetter(switching, true)).toEqual({ ok: true, reasons: [] });
  });

  it("exige le garde-fou LCA", () => {
    const r = canGenerateTerminationLetter({ ...switching, lcaAckAt: null }, true);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(" ")).toContain("LCA");
  });

  it("refuse si l'on ne change pas de caisse", () => {
    expect(canGenerateTerminationLetter({ ...switching, decision: "KEEP" }, true).ok).toBe(false);
    expect(canGenerateTerminationLetter({ ...switching, chosenInsurerId: 8 }, true).ok).toBe(false);
  });

  it("exige l'adresse de résiliation", () => {
    expect(canGenerateTerminationLetter(switching, false).ok).toBe(false);
  });
});

describe("décisions", () => {
  it("déduit la décision de l'offre choisie", () => {
    const current = { franchiseChf: 300, modelType: "STANDARD", tariffCode: "BASE" };
    expect(inferDecision(8, current, { insurerId: 1542, franchiseChf: 300, modelType: "STANDARD", tariffCode: "B" })).toBe("SWITCH");
    expect(inferDecision(8, current, { insurerId: 8, franchiseChf: 2500, modelType: "STANDARD", tariffCode: "BASE" })).toBe("CHANGE_FRANCHISE");
    expect(inferDecision(8, current, { insurerId: 8, franchiseChf: 300, modelType: "TELMED", tariffCode: "T" })).toBe("CHANGE_MODEL");
    expect(inferDecision(8, current, { insurerId: 8, franchiseChf: 300, modelType: "STANDARD", tariffCode: "BASE" })).toBe("KEEP");
  });

  it("valide la cohérence décision / offre", () => {
    expect(validateDecision("SWITCH", 8, { insurerId: 8, franchiseChf: 300, modelType: "STANDARD" }, null).ok).toBe(false);
    expect(validateDecision("CHANGE_FRANCHISE", 8, { insurerId: 1542, franchiseChf: 300, modelType: "STANDARD" }, null).ok).toBe(false);
    expect(validateDecision("SWITCH", 8, null, null).ok).toBe(false);
    expect(validateDecision("KEEP", 8, null, null).ok).toBe(true);
  });

  it("calcule la hausse", () => {
    expect(premiumChange(40000, 42960)).toEqual({ deltaMonthlyRp: 2960, deltaAnnualRp: 35520, changeBp: 740 });
  });
});

describe("statut du rituel", () => {
  const line = { decision: null, lcaAckAt: null, letterSentAt: null, affiliationConfirmedAt: null, insurerAckAt: null };
  it("progresse avec les lignes", () => {
    expect(deriveReviewStatus({ lines: [line] }, false)).toBe("DRAFT");
    expect(deriveReviewStatus({ lines: [{ ...line, decision: "KEEP" }] }, false)).toBe("CONFIRMED");
    expect(deriveReviewStatus({ lines: [{ ...line, decision: "SWITCH" }] }, false)).toBe("DECIDED");
    expect(deriveReviewStatus({ lines: [{ ...line, decision: "SWITCH", letterSentAt: "x" }] }, false)).toBe("LETTERS_SENT");
    expect(
      deriveReviewStatus({ lines: [{ ...line, decision: "SWITCH", letterSentAt: "x", affiliationConfirmedAt: "y", insurerAckAt: "z" }] }, false),
    ).toBe("CONFIRMED");
    expect(deriveReviewStatus({ lines: [] }, true)).toBe("CLOSED");
  });

  it("étapes affichées", () => {
    expect(ritualSteps("DRAFT", true).map((s) => s.state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
    expect(ritualSteps("DECIDED", true).map((s) => s.state)).toEqual(["done", "done", "done", "current", "todo"]);
    expect(ritualSteps("LETTERS_SENT", false).map((s) => s.state)).toEqual(["done", "done", "done", "current"]);
    expect(ritualSteps("CLOSED", false).every((s) => s.state === "done")).toBe(true);
  });
});

describe("garde-fou LCA", () => {
  const lca: LcaPolicy = {
    id: 1,
    personId: 1,
    insurerId: 8,
    productName: "Hospital Flex",
    category: "HOSPITAL",
    policyNumber: "L-1",
    startDate: "2020-01-01",
    minTermEnd: "2027-12-31",
    noticeMonths: 3,
    bundledDiscount: true,
    status: "ACTIVE",
    monthlyPremiumRp: 4500,
  };

  it("liste les complémentaires chez la caisse quittée", () => {
    const w = lcaWarningsForSwitch([lca, { ...lca, id: 2, insurerId: 99 }, { ...lca, id: 3, personId: 2 }], 1, 8);
    expect(w).toHaveLength(1);
    expect(w[0]!.messages.join(" ")).toContain("reste active");
    expect(w[0]!.messages.join(" ")).toContain("rabais");
    expect(w[0]!.messages.join(" ")).toContain("questionnaire de santé");
  });

  it("calcule la première résiliation possible", () => {
    expect(earliestLcaTermination(lca, "2026-10-02")).toBe("2027-12-31");
    expect(earliestLcaTermination({ ...lca, minTermEnd: null }, "2026-09-15")).toBe("2026-12-31");
    expect(earliestLcaTermination({ ...lca, minTermEnd: null }, "2026-10-02")).toBe("2027-12-31");
  });
});

describe("lettre de résiliation", () => {
  const base = {
    sender: { name: "Nathan Exemple", addressLines: ["Rue du Lac 1", "1000 Lausanne"] },
    recipient: { name: "CSS Assurance-maladie SA", addressLines: ["Case postale 2568", "6002 Lucerne"] },
    place: "Lausanne",
    date: "2026-10-20",
    targetYear: 2027,
    newInsurerName: "Assura",
    legalRepresentativeName: "Nathan Exemple",
  };

  it("exclut explicitement la LCA et vise le 31 décembre", () => {
    const l = buildTerminationLetter({
      ...base,
      persons: [{ firstName: "Nathan", lastName: "Exemple", birthDate: "1990-05-01", policyNumber: "123", isMinor: false }],
    });
    const text = l.paragraphs.join(" ");
    expect(text).toContain("31 décembre 2026");
    expect(text).toContain("assurances complémentaires (LCA)");
    expect(text).toContain("ne sont pas résiliées");
    expect(text).toContain("art. 7 al. 5 LAMal");
    expect(l.subject).toContain("police n° 123");
    expect(l.placeDate).toBe("Lausanne, le 20 octobre 2026");
    expect(l.signatures).toEqual(["Nathan Exemple"]);
    expect(l.closing).toContain("Je vous prie");
  });

  it("gère un foyer avec un mineur", () => {
    const l = buildTerminationLetter({
      ...base,
      persons: [
        { firstName: "Nathan", lastName: "Exemple", birthDate: "1990-05-01", policyNumber: "123", isMinor: false },
        { firstName: "Léa", lastName: "Exemple", birthDate: "2015-02-01", policyNumber: "124", isMinor: true },
        { firstName: "Sam", lastName: "Exemple", birthDate: "1991-02-01", policyNumber: "125", isMinor: false },
      ],
    });
    expect(l.subject).toContain("polices n° 123, 124, 125");
    expect(l.signatures).toEqual(["Nathan Exemple", "Sam Exemple"]);
    expect(l.paragraphs[0]).toContain("nous résilions");
    expect(l.footerNote).toContain("représentant légal");
    expect(l.personsTable[1]).toEqual({ name: "Léa Exemple", birthDate: "01.02.2015", policyNumber: "124" });
  });

  it("refuse une lettre sans numéro de police", () => {
    expect(() =>
      buildTerminationLetter({ ...base, persons: [{ firstName: "A", lastName: "B", birthDate: "1990-01-01", policyNumber: " ", isMinor: false }] }),
    ).toThrow();
  });
});
