/** Rend une lettre d'exemple en PDF (contrôle visuel de la mise en page). */
import fs from "node:fs";
import { buildLetter } from "@/domain/letter";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";

const content = buildLetter({
  kind: "TERMINATION",
  senderLines: ["Alex Exemple", "Rue du Lac 1", "1003 Lausanne"],
  insurerLines: ["Helsana Versicherungen AG", "Case postale", "8081 Zürich"],
  place: "Lausanne",
  date: "2026-10-05",
  effectiveEnd: "2026-12-31",
  targetYear: 2027,
  persons: [
    { fullName: "Alex Exemple", birthDate: "1988-04-12", policyNumber: "123.456.789", isMinor: false },
    { fullName: "Sam Exemple", birthDate: "1990-02-01", policyNumber: "123.456.790", isMinor: false },
    { fullName: "Léa Exemple", birthDate: "2016-07-20", policyNumber: null, isMinor: true },
  ],
  newInsurerName: "Assura-Basis SA",
});
fs.writeFileSync(process.argv[2] ?? "lettre-exemple.pdf", await renderLetterPdf(content));
