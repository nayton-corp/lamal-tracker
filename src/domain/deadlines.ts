import { addDays, compareIsoDate, daysBetween, isoDate, lastWorkingDayOnOrBefore, subtractWorkingDays, type IsoDate } from "./calendar";
import type { ModelType } from "./insurance-model";

/**
 * Échéances de résiliation LAMal (art. 7 LAMal).
 *
 * - Changement ordinaire au 1er janvier après l'annonce de la nouvelle prime : la résiliation doit être
 *   **reçue** par l'assureur au plus tard le 30 novembre (préavis d'un mois).
 * - Assurance ordinaire (franchise minimale, sans modèle alternatif) : résiliation possible aussi pour le
 *   30 juin, reçue au plus tard le 31 mars (préavis de trois mois).
 */
export interface TerminationDeadline {
  /** Année où la nouvelle couverture commence. */
  targetYear: number;
  /** Date légale de réception par l'assureur. */
  legalReceiptDate: IsoDate;
  /** Dernier jour ouvrable avant la date légale (la Poste ne distribue pas le dimanche). */
  receiptByWorkingDay: IsoDate;
  /** Date d'envoi recommandée en courrier recommandé, avec marge. */
  recommendedSendBy: IsoDate;
}

/** Marge par défaut entre l'envoi en recommandé et la réception (jours ouvrables). */
export const DEFAULT_POSTAL_MARGIN_WORKING_DAYS = 4;

export function ordinaryTerminationDeadline(targetYear: number, postalMarginWorkingDays = DEFAULT_POSTAL_MARGIN_WORKING_DAYS): TerminationDeadline {
  const legal = isoDate(targetYear - 1, 11, 30);
  const receiptByWorkingDay = lastWorkingDayOnOrBefore(legal);
  return {
    targetYear,
    legalReceiptDate: legal,
    receiptByWorkingDay,
    recommendedSendBy: subtractWorkingDays(receiptByWorkingDay, postalMarginWorkingDays),
  };
}

export interface MidYearEligibility {
  eligible: boolean;
  reason: string;
  legalReceiptDate: IsoDate | null;
  effectiveEndDate: IsoDate | null;
}

/** Résiliation au 30 juin : seulement en assurance ordinaire avec la franchise minimale. */
export function midYearTermination(year: number, model: ModelType, franchiseChf: number, minimumFranchiseChf: number): MidYearEligibility {
  if (model !== "STANDARD") {
    return {
      eligible: false,
      reason: "Les modèles alternatifs (médecin de famille, HMO, Telmed…) ne se résilient qu'en fin d'année.",
      legalReceiptDate: null,
      effectiveEndDate: null,
    };
  }
  if (franchiseChf !== minimumFranchiseChf) {
    return {
      eligible: false,
      reason: "Avec une franchise à option, le changement n'est possible qu'en fin d'année.",
      legalReceiptDate: null,
      effectiveEndDate: null,
    };
  }
  return {
    eligible: true,
    reason: "Assurance ordinaire avec franchise minimale : changement possible au 30 juin.",
    legalReceiptDate: isoDate(year, 3, 31),
    effectiveEndDate: isoDate(year, 6, 30),
  };
}

export type CountdownLevel = "calm" | "soon" | "urgent" | "overdue";

export interface Countdown {
  daysLeft: number;
  level: CountdownLevel;
}

export function countdown(today: IsoDate, deadline: IsoDate): Countdown {
  const daysLeft = daysBetween(today, deadline);
  const level: CountdownLevel = daysLeft < 0 ? "overdue" : daysLeft <= 7 ? "urgent" : daysLeft <= 21 ? "soon" : "calm";
  return { daysLeft, level };
}

/** Jours avant l'envoi recommandé auxquels un rappel est envoyé. */
export const REMINDER_OFFSETS_DAYS = [30, 14, 7, 3, 1, 0] as const;

/**
 * Palier de rappel atteint à cette date (J-30, J-14… J-0 compté depuis l'envoi recommandé).
 * On retourne le palier le plus récent plutôt que le jour exact : un rappel n'est pas perdu si le
 * serveur était éteint ce jour-là. La notification étant idempotente par palier, rien n'est envoyé deux fois.
 */
export function remindersDue(today: IsoDate, deadline: TerminationDeadline): number[] {
  if (compareIsoDate(today, deadline.receiptByWorkingDay) > 0) return [];
  const reached = REMINDER_OFFSETS_DAYS.filter((offset) => compareIsoDate(today, addDays(deadline.recommendedSendBy, -offset)) >= 0);
  return reached.length ? [Math.min(...reached)] : [];
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return compareIsoDate(a, b) > 0;
}

/**
 * Les primes de l'année suivante sont publiées par l'OFSP fin septembre ;
 * la saison du rituel va de mi-septembre au 31 décembre.
 */
export function isReviewSeason(today: IsoDate): boolean {
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  return month >= 10 || (month === 9 && day >= 15);
}

/** Année cible du rituel en cours selon la date du jour (octobre 2026 → 2027). */
export function reviewTargetYear(today: IsoDate): number {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month >= 7 ? year + 1 : year;
}
