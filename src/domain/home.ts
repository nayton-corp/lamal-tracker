import { daysBetween, formatDateLong, type IsoDate } from "./dates";
import { reviewDeadlines } from "./deadlines";
import type { Decision } from "./review";

/*
 * Accueil : la carte de l'année (où en est le foyer pour l'an prochain) et la liste des tâches,
 * la plus urgente en haut. Tout est déduit d'un état du foyer et de la date du jour, sans accès
 * à la base : les rappels par e-mail pourront reprendre la même liste.
 */

/**
 * État de la carte de l'année :
 * - NOT_PUBLISHED : primes de l'an prochain pas encore publiées (aussi après le 1er janvier) ;
 * - NOT_STARTED : publiées, rien de fait (ni préférences ni choix) ;
 * - CHOOSING : au moins une personne sans choix ;
 * - TO_SEND : tout le monde a choisi, des courriers restent à envoyer ;
 * - DONE : tout est envoyé (ou rien à envoyer), contrats de l'an prochain enregistrés ;
 * - MISSED : délai de réception passé sans avoir terminé.
 */
export type YearCardState = "NOT_PUBLISHED" | "NOT_STARTED" | "CHOOSING" | "TO_SEND" | "DONE" | "MISSED";

export interface HomeLineFacts {
  lineId: number;
  firstName: string;
  decision: Decision;
  /** Tarif de renouvellement retrouvé (MATCHED, PROBABLE) ou à préciser (AMBIGUOUS, MISSING). */
  renewalStatus: "MATCHED" | "PROBABLE" | "AMBIGUOUS" | "MISSING";
}

export interface HomeDocumentFacts {
  kind: "TERMINATION" | "CHANGE" | "REQUEST";
  insurerName: string;
}

export interface HomeReviewFacts {
  closed: boolean;
  preferencesSaved: boolean;
  lines: readonly HomeLineFacts[];
  /** Courriers préparés et pas encore envoyés (lettres refusées par Pingen comprises). */
  unsentDocuments: readonly HomeDocumentFacts[];
  /** Adultes concernés par un courrier qui n'ont pas encore signé. */
  unsignedSigners: readonly string[];
}

export interface HomeFacts {
  today: IsoDate;
  /** Année dont on prépare les contrats (l'an prochain). */
  targetYear: number;
  /** Année des contrats en cours. */
  contractYear: number;
  published: boolean;
  /** Bilan de l'année cible ; null s'il n'existe pas (contrats manquants ou primes pas publiées). */
  review: HomeReviewFacts | null;
  personsWithoutContract: readonly { personId: number; firstName: string }[];
  /** Passkey ou double facteur actif. */
  accountSecured: boolean;
}

/** Où mène une tâche ; l'interface en fait une adresse. */
export type TaskTarget =
  | { to: "letters" }
  | { to: "compare"; lineId: number }
  | { to: "review" }
  | { to: "contract"; personId: number }
  | { to: "account" };

export interface HomeTask {
  key: string;
  label: string;
  target: TaskTarget;
}

export function yearCardState(facts: HomeFacts): YearCardState {
  const r = facts.review;
  if (!facts.published) return "NOT_PUBLISHED";
  if (r?.closed) return "DONE";
  if (daysBetween(facts.today, reviewDeadlines(facts.targetYear).receiptDeadline) < 0) return "MISSED";
  if (!r || !isStarted(r)) return "NOT_STARTED";
  if (r.lines.some((l) => l.decision === "UNDECIDED")) return "CHOOSING";
  return "TO_SEND";
}

const isStarted = (r: HomeReviewFacts) => r.preferencesSaved || r.lines.some((l) => l.decision !== "UNDECIDED");

/**
 * Tâche portée par le bouton de la carte ; null quand la carte n'en a pas (primes pas publiées,
 * délai passé) ou qu'elle mène seulement au bilan terminé.
 */
export function yearCardTask(facts: HomeFacts): HomeTask | null {
  const state = yearCardState(facts);
  const r = facts.review;
  if (state === "NOT_STARTED") {
    if (r) return { key: "start", label: "Commencer le bilan", target: { to: "review" } };
    const missing = facts.personsWithoutContract[0];
    return missing ? contractTask(facts, missing) : null;
  }
  if (state === "CHOOSING") {
    const next = r!.lines.find((l) => l.decision === "UNDECIDED")!;
    return { key: `choose-${next.lineId}`, label: `Choisir pour ${next.firstName}`, target: { to: "compare", lineId: next.lineId } };
  }
  if (state === "TO_SEND") return { key: "send", label: "Envoyer les courriers", target: { to: "letters" } };
  return null;
}

const contractTask = (facts: HomeFacts, p: { personId: number; firstName: string }): HomeTask => ({
  key: `contract-${p.personId}`,
  label: `Indiquer le contrat ${facts.contractYear} de ${p.firstName}`,
  target: { to: "contract", personId: p.personId },
});

const sameTarget = (a: TaskTarget, b: TaskTarget) => JSON.stringify(a) === JSON.stringify(b);

const DOCUMENT_LABEL: Record<HomeDocumentFacts["kind"], string> = {
  TERMINATION: "Envoyer la résiliation à",
  CHANGE: "Envoyer le changement à",
  REQUEST: "Envoyer la demande à",
};

/**
 * Tâches de l'accueil, la plus urgente en haut, sans celle que porte déjà le bouton de la carte
 * (ni les autres qui mènent au même écran). Liste vide : tout est à jour.
 */
export function homeTasks(facts: HomeFacts): HomeTask[] {
  const r = facts.review;
  const state = yearCardState(facts);
  const tasks: HomeTask[] = [];
  const reviewActive = r !== null && (state === "NOT_STARTED" || state === "CHOOSING" || state === "TO_SEND");
  if (r && reviewActive) {
    const sendBy = reviewDeadlines(facts.targetYear).sendBy;
    const before = ` avant le ${formatDateLong(sendBy)}`;
    r.unsentDocuments.forEach((d, i) =>
      tasks.push({ key: `document-${i}`, label: `${DOCUMENT_LABEL[d.kind]} ${d.insurerName}${d.kind === "REQUEST" ? "" : before}`, target: { to: "letters" } }),
    );
    if (r.unsignedSigners.length) tasks.push({ key: "sign", label: "Signer les courriers", target: { to: "letters" } });
    if (isStarted(r)) {
      for (const l of r.lines) {
        if (l.decision === "UNDECIDED") tasks.push({ key: `choose-${l.lineId}`, label: `Choisir une offre pour ${l.firstName}`, target: { to: "compare", lineId: l.lineId } });
      }
    }
    for (const l of r.lines) {
      if (l.decision === "UNDECIDED" && (l.renewalStatus === "AMBIGUOUS" || l.renewalStatus === "MISSING")) {
        tasks.push({ key: `renewal-${l.lineId}`, label: `Préciser le produit de la caisse de ${l.firstName}`, target: { to: "compare", lineId: l.lineId } });
      }
    }
    if (!isStarted(r)) tasks.push({ key: "start", label: `Voir la hausse ${facts.targetYear} et comparer`, target: { to: "review" } });
  }
  for (const p of facts.personsWithoutContract) tasks.push(contractTask(facts, p));
  if (!facts.accountSecured) tasks.push({ key: "secure", label: "Sécuriser votre compte", target: { to: "account" } });

  const onCard = yearCardTask(facts);
  return onCard ? tasks.filter((t) => !sameTarget(t.target, onCard.target)) : tasks;
}
