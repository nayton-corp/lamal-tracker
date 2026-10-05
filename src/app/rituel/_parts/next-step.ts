import type { ReviewView } from "@/application/review";
import { isStepDone, needsLetter } from "@/domain/ritual-steps";

export type NextStepKind = "strategy" | "needs" | "compare" | "procedures" | "none";

export interface NextStep {
  kind: NextStepKind;
  href: string;
  label: string;
}

/**
 * Prochaine étape du parcours du rituel, dans l'ordre : stratégie, besoins, choix, envoi. Une fois
 * tout envoyé, le rituel se clôt de lui-même (application/review/close.ts) : « none ».
 */
export function nextStep(view: ReviewView): NextStep {
  const year = view.review.targetYear;
  const base = `/rituel/${year}`;
  const undecided = view.lines.filter((p) => p.line.decision === "UNDECIDED");
  if (view.review.status === "CLOSED") return { kind: "none", href: base, label: "Voir le rituel" };
  if (undecided.length > 0 && !view.review.strategy && undecided.length === view.lines.length) {
    return { kind: "strategy", href: `${base}/strategie`, label: "Choisir ma stratégie" };
  }
  if (undecided.length > 0 && !view.review.needsConfirmedAt && undecided.length === view.lines.length) {
    return { kind: "needs", href: `${base}/besoins`, label: "Préciser mes besoins" };
  }
  if (undecided.length > 0) return { kind: "compare", href: `${base}/comparer`, label: undecided.length === view.lines.length ? "Comparer les offres" : `Comparer pour ${undecided[0]!.person.firstName}` };
  const needsLetters = view.lines.some((p) => needsLetter(p.line.decision));
  if (needsLetters && !isStepDone(view.steps, "procedures")) return { kind: "procedures", href: `${base}/lettres`, label: "Envoyer les courriers" };
  return { kind: "none", href: base, label: "Voir le rituel" };
}
