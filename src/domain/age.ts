import type { IsoDate } from "./dates";
import type { AgeClass } from "./lamal";

/*
 * Classe d'âge LAMal (enfant, jeune adulte, adulte) : elle détermine la prime, les franchises
 * possibles et le plafond de quote-part. Seule l'année de naissance compte, pas le jour.
 */

/**
 * Classe d'âge LAMal pour une année de couverture : elle dépend de l'année de
 * naissance seulement (enfant jusqu'à l'année des 18 ans, jeune adulte de 19 à 25).
 */
export function ageClassForYear(birthDate: string, coverageYear: number): AgeClass {
  const birthYear = Number(birthDate.slice(0, 4));
  if (!Number.isInteger(birthYear) || birthYear < 1900) {
    throw new Error(`Date de naissance invalide : ${birthDate}`);
  }
  const age = coverageYear - birthYear;
  if (age < 0) throw new Error(`Personne pas encore née en ${coverageYear}`);
  if (age <= 18) return "KID";
  if (age <= 25) return "YOUNG";
  return "ADULT";
}

export interface AgeTransition {
  from: AgeClass;
  to: AgeClass;
  message: string;
}

/** Changement de classe d'âge entre l'année en cours et `targetYear` (avertissement du rituel) ; null si aucun. */
export function ageTransition(birthDate: string, targetYear: number): AgeTransition | null {
  const from = ageClassForYear(birthDate, targetYear - 1);
  const to = ageClassForYear(birthDate, targetYear);
  if (from === to) return null;
  const message =
    from === "KID"
      ? `Passe en catégorie jeune adulte en ${targetYear} : les franchises enfant (0–600) ne s'appliquent plus, une franchise adulte (300–2500) doit être choisie.`
      : `Passe en catégorie adulte en ${targetYear} : la prime augmente généralement nettement.`;
  return { from, to, message };
}

/**
 * Mineur à une date donnée : vrai tant que le 18e anniversaire n'est pas atteint
 * (comparaison sur la date complète, pas seulement l'année).
 */
export function isMinorOn(birthDate: IsoDate, date: IsoDate): boolean {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  if (![by, bm, bd].every((n) => Number.isInteger(n)) || by! < 1900) {
    throw new Error(`Date de naissance invalide : ${birthDate}`);
  }
  const eighteenth = `${by! + 18}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
  return date < eighteenth;
}
