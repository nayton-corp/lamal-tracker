import { formatDateFr, formatDateShort, type IsoDate } from "./calendar";

export interface LetterPerson {
  firstName: string;
  lastName: string;
  birthDate: IsoDate;
  policyNumber: string;
  /** Mineur pendant l'année de la lettre : le représentant légal signe pour lui. */
  isMinor: boolean;
}

export interface LetterInput {
  sender: { name: string; addressLines: string[] };
  recipient: { name: string; addressLines: string[] };
  place: string;
  date: IsoDate;
  /** Année de la nouvelle couverture : la résiliation prend effet au 31.12 de l'année précédente. */
  targetYear: number;
  persons: LetterPerson[];
  newInsurerName: string | null;
  /** Représentant légal qui signe pour les mineurs. */
  legalRepresentativeName: string;
}

export interface LetterContent {
  senderBlock: string[];
  recipientBlock: string[];
  placeDate: string;
  subject: string;
  salutation: string;
  paragraphs: string[];
  personsTable: { name: string; birthDate: string; policyNumber: string }[];
  closing: string;
  /** Chaque adulte concerné signe pour lui-même ; le représentant légal signe pour les mineurs. */
  signatures: string[];
  footerNote: string;
  mentionRegistered: string;
}

/** Mention obligatoire : la résiliation ne touche jamais les complémentaires. */
export function lcaExclusionSentence(plural = false): string {
  return (
    "Cette résiliation concerne exclusivement l'assurance obligatoire des soins selon la LAMal. " +
    `Toutes ${plural ? "nos" : "mes"} assurances complémentaires (LCA) éventuelles auprès de votre société restent en vigueur et ne sont pas résiliées.`
  );
}

export function buildTerminationLetter(input: LetterInput): LetterContent {
  if (input.persons.length === 0) throw new Error("Une lettre de résiliation doit concerner au moins une personne.");
  for (const p of input.persons) {
    if (!p.policyNumber.trim()) throw new Error(`Numéro de police manquant pour ${p.firstName} ${p.lastName}.`);
  }
  const endDate = `31 décembre ${input.targetYear - 1}`;
  const several = input.persons.length > 1;
  const policies = input.persons.map((p) => p.policyNumber).join(", ");
  const subject = several
    ? `Résiliation de l'assurance obligatoire des soins (LAMal) – polices n° ${policies}`
    : `Résiliation de l'assurance obligatoire des soins (LAMal) – police n° ${policies}`;
  const concerned = several ? "des personnes mentionnées ci-dessous" : `de ${input.persons[0]!.firstName} ${input.persons[0]!.lastName}`;
  const plural = signaturesFor(input).length > 1;
  const paragraphs = [
    `Par la présente, ${plural ? "nous résilions" : "je résilie"} l'assurance obligatoire des soins (LAMal) ${concerned} pour le ${endDate}, ` +
      `conformément à l'art. 7 al. 2 LAMal, suite à la communication de la nouvelle prime ${input.targetYear}.`,
    lcaExclusionSentence(plural),
    input.newInsurerName
      ? `${input.newInsurerName} vous confirmera directement l'affiliation dès le 1er janvier ${input.targetYear}, ` +
        "conformément à l'art. 7 al. 5 LAMal."
      : `${plural ? "Notre" : "Mon"} nouvel assureur vous confirmera directement l'affiliation dès le 1er janvier ${input.targetYear}, ` +
        "conformément à l'art. 7 al. 5 LAMal.",
    `${plural ? "Nous vous remercions de nous" : "Je vous remercie de me"} faire parvenir une confirmation écrite de cette résiliation.`,
  ];
  return {
    senderBlock: [input.sender.name, ...input.sender.addressLines],
    recipientBlock: [input.recipient.name, ...input.recipient.addressLines],
    placeDate: `${input.place}, le ${formatDateFr(input.date)}`,
    subject,
    salutation: "Madame, Monsieur,",
    paragraphs,
    personsTable: input.persons.map((p) => ({
      name: `${p.firstName} ${p.lastName}`,
      birthDate: formatDateShort(p.birthDate),
      policyNumber: p.policyNumber,
    })),
    closing: plural
      ? "Nous vous prions d'agréer, Madame, Monsieur, nos salutations distinguées."
      : "Je vous prie d'agréer, Madame, Monsieur, mes salutations distinguées.",
    signatures: signaturesFor(input),
    footerNote: input.persons.some((p) => p.isMinor)
      ? `${input.legalRepresentativeName} signe en qualité de représentant légal pour les personnes mineures.`
      : "",
    mentionRegistered: "Recommandé",
  };
}

function signaturesFor(input: LetterInput): string[] {
  const names = input.persons.filter((p) => !p.isMinor).map((p) => `${p.firstName} ${p.lastName}`);
  if (input.persons.some((p) => p.isMinor) && !names.includes(input.legalRepresentativeName)) {
    names.push(input.legalRepresentativeName);
  }
  return names;
}
