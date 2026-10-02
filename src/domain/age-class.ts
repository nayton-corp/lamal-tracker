import { parseIsoDate, type IsoDate } from "./calendar";

/**
 * Classes d'âge LAMal. L'âge retenu est celui atteint pendant l'année civile de couverture
 * (année − année de naissance) : enfant jusqu'à 18 ans, jeune adulte de 19 à 25, adulte dès 26.
 */
export const AGE_CLASSES = ["KID", "YOUNG", "ADULT"] as const;
export type AgeClass = (typeof AGE_CLASSES)[number];

export const AGE_CLASS_LABEL: Record<AgeClass, string> = {
  KID: "Enfant (0–18)",
  YOUNG: "Jeune adulte (19–25)",
  ADULT: "Adulte (26+)",
};

export function ageInYear(birthDate: IsoDate, year: number): number {
  return year - parseIsoDate(birthDate).year;
}

export function ageClassFor(birthDate: IsoDate, year: number): AgeClass {
  const age = ageInYear(birthDate, year);
  if (age < 0) throw new Error(`La personne n'est pas encore née en ${year}.`);
  if (age <= 18) return "KID";
  if (age <= 25) return "YOUNG";
  return "ADULT";
}

export interface AgeClassChange {
  from: AgeClass;
  to: AgeClass;
  changed: boolean;
  /** Message affiché à l'utilisateur quand la classe change. */
  warning: string | null;
}

export function ageClassChange(birthDate: IsoDate, fromYear: number, toYear: number): AgeClassChange {
  const from = ageClassFor(birthDate, Math.max(fromYear, parseIsoDate(birthDate).year));
  const to = ageClassFor(birthDate, toYear);
  if (from === to) return { from, to, changed: false, warning: null };
  const warning =
    from === "KID"
      ? `Passage en classe « jeune adulte » en ${toYear} : les franchises enfant ne s'appliquent plus et la prime augmente nettement.`
      : `Passage en classe « adulte » en ${toYear} : la prime jeune adulte ne s'applique plus.`;
  return { from, to, changed: true, warning };
}
