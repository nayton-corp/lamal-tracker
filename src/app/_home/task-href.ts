import type { ReviewView } from "@/application/review";
import type { TaskTarget } from "@/domain/home";
import { nextStep } from "@/app/rituel/_parts/next-step";

/** Adresse d'une tâche de l'accueil. */
export function taskHref(target: TaskTarget, year: number, view: ReviewView | null): string {
  switch (target.to) {
    case "letters":
      return `/rituel/${year}/lettres`;
    case "compare":
      return `/rituel/${year}/personne/${target.lineId}`;
    case "review":
      return view ? nextStep(view).href : `/rituel/${year}`;
    case "contract":
      return `/foyer/personne/${target.personId}`;
    case "account":
      return "/compte";
  }
}
