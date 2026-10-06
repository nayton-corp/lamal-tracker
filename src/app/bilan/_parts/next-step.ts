import type { ReviewView } from "@/application/review";
import { isStepDone, needsLetter } from "@/domain/ritual-steps";

export type NextStepKind = "preferences" | "compare" | "procedures" | "none";

export interface NextStep {
  kind: NextStepKind;
  href: string;
  label: string;
}

/**
 * Prochaine étape du parcours du bilan, dans l'ordre : préférences, choix, envoi. Une fois
 * tout envoyé, le bilan se clôt de lui-même (application/review/close.ts) : « none ».
 */
export function nextStep(view: ReviewView): NextStep {
  const year = view.review.targetYear;
  const base = `/bilan/${year}`;
  const undecided = view.lines.filter((p) => p.line.decision === "UNDECIDED");
  if (view.review.status === "CLOSED") return { kind: "none", href: base, label: "Voir le bilan" };
  if (undecided.length > 0 && !view.review.needsConfirmedAt && undecided.length === view.lines.length) {
    return { kind: "preferences", href: `${base}/preferences`, label: "Régler mes préférences" };
  }
  if (undecided.length > 0) return { kind: "compare", href: `${base}/comparer`, label: undecided.length === view.lines.length ? "Comparer les offres" : `Comparer pour ${undecided[0]!.person.firstName}` };
  const needsLetters = view.lines.some((p) => needsLetter(p.line.decision));
  if (needsLetters && !isStepDone(view.steps, "procedures")) return { kind: "procedures", href: `${base}/lettres`, label: "Envoyer les courriers" };
  return { kind: "none", href: base, label: "Voir le bilan" };
}
