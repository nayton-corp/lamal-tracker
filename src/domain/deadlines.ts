import { addDays, daysBetween, isWeekend, type IsoDate } from "./dates";

export interface ReviewDeadlines {
  /** Fin de l'année en cours : date d'effet de la résiliation. */
  effectiveEnd: IsoDate;
  /** Dernier jour où la lettre doit être REÇUE par la caisse (30 novembre, ramené au jour ouvrable). */
  receiptDeadline: IsoDate;
  /** Date d'envoi recommandée (recommandé, marge postale et de retrait). */
  sendBy: IsoDate;
  /** Les caisses doivent communiquer la nouvelle prime au plus tard deux mois avant (31 octobre). */
  insurerNoticeBy: IsoDate;
}

/** Marge entre l'envoi recommandé et la réception : acheminement et délai de retrait au guichet. */
export const POSTAL_MARGIN_DAYS = 7;
/** En deçà de ce nombre de jours avant la date d'envoi conseillée, l'échéance devient « bientôt ». */
export const SOON_THRESHOLD_DAYS = 14;

/**
 * Échéances pour changer d'assurance de base au 1er janvier de targetYear.
 * Prudence : si le 30 novembre tombe un week-end, on vise le vendredi précédent.
 */
export function reviewDeadlines(targetYear: number): ReviewDeadlines {
  const year = targetYear - 1;
  let receipt: IsoDate = `${year}-11-30`;
  while (isWeekend(receipt)) receipt = addDays(receipt, -1);
  let sendBy = addDays(receipt, -POSTAL_MARGIN_DAYS);
  while (isWeekend(sendBy)) sendBy = addDays(sendBy, -1);
  return {
    effectiveEnd: `${year}-12-31`,
    receiptDeadline: receipt,
    sendBy,
    insurerNoticeBy: `${year}-10-31`,
  };
}

export type Urgency = "calm" | "soon" | "urgent" | "late";

export function urgency(today: IsoDate, deadlines: ReviewDeadlines): Urgency {
  if (daysBetween(today, deadlines.receiptDeadline) < 0) return "late";
  const toSend = daysBetween(today, deadlines.sendBy);
  if (toSend < 0) return "urgent";
  if (toSend <= SOON_THRESHOLD_DAYS) return "soon";
  return "calm";
}

/** Jours de rappel avant la date d'envoi recommandée. */
export const REMINDER_OFFSETS = [30, 14, 7, 3, 1] as const;

export function dueReminder(today: IsoDate, deadlines: ReviewDeadlines): number | null {
  const left = daysBetween(today, deadlines.sendBy);
  return (REMINDER_OFFSETS as readonly number[]).includes(left) ? left : null;
}

/**
 * Fenêtre du rituel : les primes de l'année prochaine sont publiées et le délai de résiliation
 * (réception au 30 novembre) n'est pas passé. C'est le moment où l'app met le rituel en avant.
 */
export function isReviewWindowOpen(today: IsoDate, targetYear: number, premiumsPublished: boolean): boolean {
  return premiumsPublished && daysBetween(today, reviewDeadlines(targetYear).receiptDeadline) >= 0;
}
