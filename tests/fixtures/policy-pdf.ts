import fs from "node:fs";
import path from "node:path";
import React from "react";
import { rows } from "./generate";

/** Police LAMal 2026 d'une personne seule, telle que reçue d'une caisse (texte sélectionnable). */
export async function writePolicyPdf(out: string): Promise<string> {
  const { Document, Page, Text, renderToBuffer } = await import("@react-pdf/renderer");
  // Prime officielle 2026 : Helsana, VD région 1, Telmed, adulte, franchise 2500, sans accident.
  const row = rows(2026).find((r) => r[0] === 1562 && r[1] === "VD" && r[2] === "PR-REG CH1" && r[9] === "HEL-TEL26" && r[6] === "AKL-ERW" && r[8] === "OHN-UNF" && r[13] === "FRA-2500")!;
  const premium = (row[14] as number).toFixed(2);
  const lines = [
    "Helsana Assurances SA",
    "Case postale",
    "8081 Zurich",
    "",
    "Monsieur",
    "Alex Test",
    "Rue du Lac 1",
    "1003 Lausanne",
    "",
    "Police d'assurance 2026, valable dès le 01.01.2026",
    "N° d'assuré : 756.1234.5678.97",
    `Test Alex, né le 12.04.1988 · Assurance obligatoire des soins LAMal · Telmed · franchise CHF 2'500 · sans couverture accidents · prime mensuelle ${premium}`,
  ];
  const doc = React.createElement(Document, null, React.createElement(Page, { size: "A4" }, ...lines.map((l, i) => React.createElement(Text, { key: i }, l))));
  const file = path.join(out, "police-2026.pdf");
  fs.writeFileSync(file, new Uint8Array(await renderToBuffer(doc)));
  return file;
}

