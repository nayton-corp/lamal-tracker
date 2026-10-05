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

/** Dans `paragraphs`, ces marqueurs sont remplacés au rendu par la liste des personnes et la liste annexe. */
export const PERSONS_PLACEHOLDER = "__PERSONS__";
export const EXTRA_ROWS_PLACEHOLDER = "__EXTRA__";

/**
 * Contenu figé d'une lettre, enregistré en JSON dans `letter.content` : ne renommer aucun champ
 * sans prévoir la lecture des lettres déjà enregistrées.
 */
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
  /** Mention postale au-dessus du destinataire ; absente des anciennes lettres = « RECOMMANDÉ ». */
  mailing?: string | null;
  /** Liste à puces après les personnes (complémentaires demandées). */
  extraRows?: string[];
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
    paragraphs: [...paragraphs, PERSONS_PLACEHOLDER, ...after],
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

export interface OfferRequestPerson extends LetterPerson {
  /** « Télémédecine (Callmed), franchise CHF 2500, sans couverture accident » */
  wish: string;
  /** Complémentaires souhaitées (libellés), vide si aucune. */
  lca: string[];
}

export interface OfferRequestInput {
  senderLines: string[];
  insurerLines: string[];
  place: string;
  date: IsoDate;
  targetYear: number;
  persons: OfferRequestPerson[];
  /** Adresse de domicile, utile à la caisse pour la région de prime. */
  domicile: string;
}

/**
 * Demande d'offre et d'affiliation adressée à la nouvelle caisse : l'assurance de base doit
 * être acceptée sans réserve (art. 4 LAMal), les complémentaires restent soumises à
 * questionnaire de santé ; on le rappelle pour ne rien résilier avant leur acceptation.
 */
export function buildOfferRequest(input: OfferRequestInput): LetterContent {
  const several = input.persons.length > 1;
  const withLca = input.persons.filter((p) => p.lca.length > 0);
  const paragraphs = [
    `Je souhaite affilier à votre caisse, pour l'assurance obligatoire des soins (LAMal) dès le 1er janvier ${input.targetYear}, ${several ? "les personnes suivantes" : "la personne suivante"}, domiciliée${several ? "s" : ""} ${input.domicile} :`,
    PERSONS_PLACEHOLDER,
    "Je vous prie de m'adresser une offre correspondante ainsi que la confirmation d'affiliation ou les documents à remplir.",
  ];
  if (withLca.length) {
    paragraphs.push(
      "Je vous prie également de me faire une offre pour les assurances complémentaires (LCA) suivantes, avec les questionnaires de santé nécessaires :",
      EXTRA_ROWS_PLACEHOLDER,
      "Je ne résilierai mes complémentaires actuelles qu'après votre acceptation écrite de celles-ci.",
    );
  }
  return {
    senderLines: input.senderLines,
    insurerLines: input.insurerLines,
    placeAndDate: `${input.place}, le ${formatDateLong(input.date)}`,
    subject: `Demande d'offre et d'affiliation à l'assurance de base dès le 1er janvier ${input.targetYear}`,
    salutation: "Madame, Monsieur,",
    paragraphs,
    personRows: input.persons.map((p) => [p.fullName, `né·e le ${formatDateLong(p.birthDate)}`, p.wish].join(", ")),
    extraRows: withLca.map((p) => `${p.fullName} : ${p.lca.join(", ")}`),
    lcaClause: null,
    closing: "En vous remerciant de votre réponse, je vous prie d'agréer, Madame, Monsieur, mes salutations distinguées.",
    signatures: input.persons.filter((p) => !p.isMinor).map((p) => p.fullName).concat(input.persons.every((p) => p.isMinor) ? ["Représentant·e légal·e"] : []),
    footer: "Demande sans engagement. La résiliation auprès de la caisse actuelle est envoyée séparément.",
    mailing: null,
  };
}

/** Version texte d'un courrier, pour un e-mail. */
export function letterPlainText(c: LetterContent): string {
  const blocks = c.paragraphs.map((p) =>
    p === PERSONS_PLACEHOLDER ? c.personRows.map((r) => `- ${r}`).join("\n") : p === EXTRA_ROWS_PLACEHOLDER ? (c.extraRows ?? []).map((r) => `- ${r}`).join("\n") : p,
  );
  return [c.salutation, ...blocks, ...(c.lcaClause ? [c.lcaClause] : []), c.closing, [...c.signatures, ...c.senderLines.slice(1)].join("\n")].join("\n\n");
}
