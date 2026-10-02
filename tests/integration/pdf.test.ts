import { describe, expect, it } from "vitest";
import { buildTerminationLetter } from "@/domain/termination-letter";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";

describe("lettre PDF", () => {
  it("produit un PDF A4 valide avec les accents", async () => {
    const content = buildTerminationLetter({
      sender: { name: "Nathan Exemple", addressLines: ["Rue du Lac 1", "1000 Lausanne"] },
      recipient: { name: "CSS Kranken-Versicherung AG", addressLines: ["Case postale 2568", "6002 Lucerne"] },
      place: "Lausanne",
      date: "2026-10-20",
      targetYear: 2027,
      persons: [
        { firstName: "Nathan", lastName: "Exemple", birthDate: "1990-05-01", policyNumber: "123", isMinor: false },
        { firstName: "Léa", lastName: "Exemple", birthDate: "2015-02-01", policyNumber: "124", isMinor: true },
      ],
      newInsurerName: "Assura",
      legalRepresentativeName: "Nathan Exemple",
    });
    const pdf = await renderLetterPdf(content);
    const head = new TextDecoder("latin1").decode(pdf.subarray(0, 8));
    expect(head.startsWith("%PDF-")).toBe(true);
    expect(pdf.length).toBeGreaterThan(2000);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text).toMatch(/\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/);
  }, 30000);
});
