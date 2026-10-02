import { formatDateLong, type IsoDate } from "./dates";

export interface LetterPerson {
  fullName: string;
  birthDate: IsoDate;
  policyNumber: string | null;
  isMinor: boolean;
}

export interface LetterInput {
  kind: "TERMINATION" | "CHANGE";
  senderLines: string[];
  insurerLines: string[];
  place: string;
  date: IsoDate;
  effectiveEnd: IsoDate;
  targetYear: number;
  persons: LetterPerson[];
  /** Pour un changement : nouvelle franchise / nouveau modèle par personne (même ordre). */
  changes?: string[];
  /** Nom de la nouvelle caisse (informatif, n'apparaît que si fourni). */
  newInsurerName?: string | null;
}

export interface LetterContent {
  senderLines: string[];
  insurerLines: string[];
  placeAndDate: string;
  subject: string;
  salutation: string;
  paragraphs: string[];
  personRows: string[];
  lcaClause: string | null;
  closing: string;
  signatures: string[];
  footer: string;
}

/** Contenu d'une lettre, indépendant du rendu (PDF, aperçu HTML, tests). */
export function buildLetter(input: LetterInput): LetterContent {
  const several = input.persons.length > 1;
  const end = formatDateLong(input.effectiveEnd);
  const personRows = input.persons.map((p, i) => {
    const parts = [p.fullName, `né·e le ${formatDateLong(p.birthDate)}`];
    if (p.policyNumber) parts.push(`n° d'assuré ${p.policyNumber}`);
    if (input.kind === "CHANGE" && input.changes?.[i]) parts.push(input.changes[i]!);
    return parts.join(", ");
  });

  const termination = input.kind === "TERMINATION";
  const subject = termination
    ? `Résiliation de l'assurance obligatoire des soins (LAMal) au ${end}`
    : `Changement de franchise ou de modèle d'assurance au 1er janvier ${input.targetYear}`;

  const paragraphs = termination
    ? [
        `Par la présente, je résilie l'assurance obligatoire des soins selon la LAMal ${several ? "des personnes suivantes" : "de la personne suivante"}, avec effet au ${end} :`,
      ]
    : [
        `Par la présente, je vous demande de modifier l'assurance obligatoire des soins ${several ? "des personnes suivantes" : "de la personne suivante"} avec effet au 1er janvier ${input.targetYear} :`,
      ];

  const after: string[] = [];
  if (termination) {
    after.push(
      input.newInsurerName
        ? `La nouvelle caisse-maladie (${input.newInsurerName}) vous confirmera l'affiliation, conformément à l'art. 7 LAMal.`
        : "La nouvelle caisse-maladie vous confirmera l'affiliation, conformément à l'art. 7 LAMal.",
    );
  }
  after.push("Je vous remercie de bien vouloir me confirmer par écrit la réception de ce courrier.");

  const signatures = input.persons.filter((p) => !p.isMinor).map((p) => p.fullName);
  if (signatures.length === 0) signatures.push("Représentant·e légal·e");

  return {
    senderLines: input.senderLines,
    insurerLines: input.insurerLines,
    placeAndDate: `${input.place}, le ${formatDateLong(input.date)}`,
    subject,
    salutation: "Madame, Monsieur,",
    paragraphs: [...paragraphs, "__PERSONS__", ...after],
    personRows,
    lcaClause: termination
      ? "Cette résiliation porte exclusivement sur l'assurance de base obligatoire (LAMal). Les assurances complémentaires (LCA) éventuellement conclues auprès de votre groupe ne sont pas résiliées et doivent être maintenues sans changement."
      : null,
    closing: "Je vous prie d'agréer, Madame, Monsieur, mes salutations distinguées.",
    signatures,
    footer: input.persons.some((p) => p.isMinor)
      ? "Pour les personnes mineures, la lettre est signée par leur représentant·e légal·e."
      : "Envoi en recommandé.",
  };
}
