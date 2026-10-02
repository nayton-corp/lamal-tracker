import type { ReviewView } from "@/application/review";

export type NextStepKind = "strategy" | "needs" | "compare" | "lca" | "procedures" | "confirm" | "close" | "none";

export interface NextStep {
  kind: NextStepKind;
  href: string;
  label: string;
}

/** Prochaine étape du parcours du rituel, dans l'ordre : stratégie, besoins, choix, LCA, démarches. */
export function nextStep(view: ReviewView): NextStep {
  const year = view.review.targetYear;
  const base = `/rituel/${year}`;
  const undecided = view.persons.filter((p) => p.line.decision === "UNDECIDED");
  if (view.review.status === "CLOSED") return { kind: "none", href: base, label: "Voir le rituel" };
  if (undecided.length > 0 && !view.review.strategy && undecided.length === view.persons.length) {
    return { kind: "strategy", href: `${base}/strategie`, label: "Choisir ma stratégie" };
  }
  if (undecided.length > 0 && !view.review.needsConfirmedAt && undecided.length === view.persons.length) {
    return { kind: "needs", href: `${base}/besoins`, label: "Préciser mes besoins" };
  }
  if (undecided.length > 0) return { kind: "compare", href: `${base}/comparer`, label: undecided.length === view.persons.length ? "Comparer les offres" : `Comparer pour ${undecided[0]!.person.firstName}` };
  if (view.persons.some((p) => p.line.decision === "SWITCH" && !p.line.lcaAckAt)) return { kind: "lca", href: `${base}/lca`, label: "Vérifier les complémentaires" };
  const needsLetters = view.persons.some((p) => p.line.decision === "SWITCH" || p.line.decision === "ADJUST");
  const proceduresDone = view.steps.find((s) => s.key === "procedures")?.done;
  if (needsLetters && !proceduresDone) return { kind: "procedures", href: `${base}/lettres`, label: "Faire les démarches" };
  // Courriers envoyés : il reste à cocher les confirmations reçues (décembre, janvier) avant de clôturer.
  if (needsLetters && !view.steps.find((s) => s.key === "confirmed")?.done) return { kind: "confirm", href: `${base}/lettres`, label: "Cocher les confirmations reçues" };
  return { kind: "close", href: base, label: "Clôturer le rituel" };
}
