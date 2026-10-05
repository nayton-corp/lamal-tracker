import { daysBetween, formatDateLong, type IsoDate } from "./dates";
import { REMINDER_OFFSETS, type ReviewDeadlines } from "./deadlines";

/*
 * Rappels du bilan pour l'envoi des courriers postaux (notifications push, parfois aussi par
 * courriel) : avant la date d'envoi conseillée, puis juste après.
 */

/** Où en est un foyer dans l'envoi de ses courriers papier, pour une année cible. */
export interface LetterProgress {
  /** Bilan clôturé (tout est envoyé) : plus aucun rappel. */
  closed: boolean;
  /** Personnes du foyer, et celles qui ont décidé de garder leur contrat. */
  persons: number;
  keeping: number;
  /** Courriers à poster (résiliations, changements) et ceux déjà marqués envoyés. */
  letters: number;
  lettersSent: number;
}

export interface Reminder {
  /** Clé de dédoublonnage, propre au foyer : un rappel n'est jamais envoyé deux fois. */
  key: string;
  title: string;
  body: string;
  url: string;
  /** Aussi par courriel (texte sans nom de caisse ni donnée de santé). */
  mail: { subject: string; text: string } | null;
}

/** Une semaine avant la date d'envoi, le rappel part aussi par courriel (en plus de la notification). */
export const MAIL_REMINDER_DAYS_BEFORE = 7;
/** Dernier rappel, après la date d'envoi conseillée : un recommandé posté ce jour-là arrive encore. */
const LATE_REMINDER_DAYS = 2;

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Rappels dus aujourd'hui pour un foyer : avant la date d'envoi conseillée (seulement s'il reste
 * des courriers à poster, ou si le foyer n'a encore rien préparé), puis un dernier rappel juste après.
 */
export function letterReminders(today: IsoDate, targetYear: number, deadlines: ReviewDeadlines, p: LetterProgress): Reminder[] {
  if (p.closed || p.persons === 0) return [];
  const out: Reminder[] = [];
  const url = `/bilan/${targetYear}`;
  const unsent = p.letters - p.lettersSent;
  const nothingToSend = p.persons > 0 && p.keeping === p.persons;
  const sendBy = formatDateLong(deadlines.sendBy, true);
  const receipt = formatDateLong(deadlines.receiptDeadline);
  const left = daysBetween(today, deadlines.sendBy);

  if ((REMINDER_OFFSETS as readonly number[]).includes(left) && !nothingToSend && !(p.letters > 0 && unsent === 0)) {
    const tomorrow = left === 1;
    const body =
      p.letters > 0
        ? tomorrow
          ? `Demain, dernier jour conseillé pour poster en recommandé ${plural(unsent, "courrier", "courriers")} pas encore ${unsent > 1 ? "marqués envoyés" : "marqué envoyé"}. Chaque adulte signe le sien.`
          : `${plural(unsent, "courrier reste", "courriers restent")} à poster en recommandé d'ici le ${sendBy}.`
        : `Pour changer de caisse au 1er janvier, envoyez vos courriers avant le ${sendBy} (réception au plus tard le ${receipt}).`;
    out.push({
      key: `rappel-${targetYear}-J${left}`,
      title: tomorrow ? `Primes ${targetYear} : envoi demain au plus tard` : `Primes ${targetYear} : J-${left}`,
      body,
      url: p.letters > 0 ? `${url}/lettres` : url,
      mail:
        left === MAIL_REMINDER_DAYS_BEFORE || tomorrow
          ? {
              subject: tomorrow ? "Vos courriers d'assurance maladie : dernier jour conseillé demain" : "Vos courriers d'assurance maladie : plus qu'une semaine",
              text:
                p.letters > 0
                  ? `Bonjour,\n\n${plural(unsent, "courrier préparé dans Primes LAMal n'est", "courriers préparés dans Primes LAMal ne sont")} pas encore ${unsent > 1 ? "marqués envoyés" : "marqué envoyé"}. Date d'envoi conseillée : ${sendBy}. Votre caisse doit les recevoir au plus tard le ${receipt}.`
                  : `Bonjour,\n\nLes primes ${targetYear} sont publiées. Si vous voulez changer de caisse au 1er janvier, envoyez vos courriers avant le ${sendBy} (réception au plus tard le ${receipt}).`,
            }
          : null,
    });
  }

  if (left === -LATE_REMINDER_DAYS && unsent > 0 && daysBetween(today, deadlines.receiptDeadline) > 0) {
    out.push({
      key: `rappel-${targetYear}-retard`,
      title: `Primes ${targetYear} : postez aujourd'hui`,
      body: `La date conseillée est passée, mais un recommandé posté aujourd'hui arrive en général à temps (réception au plus tard le ${receipt}). ${plural(unsent, "courrier", "courriers")} à poster.`,
      url: `${url}/lettres`,
      mail: {
        subject: "Vos courriers d'assurance maladie : à poster aujourd'hui",
        text: `Bonjour,\n\nLa date d'envoi conseillée est passée et ${plural(unsent, "courrier n'est", "courriers ne sont")} pas encore ${unsent > 1 ? "marqués envoyés" : "marqué envoyé"} dans Primes LAMal. Posté aujourd'hui en recommandé, un courrier arrive en général à temps : votre caisse doit le recevoir au plus tard le ${receipt}.`,
      },
    });
  }

  return out;
}
