import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";

/*
 * Envoi des courriels de compte (confirmation, réinitialisation, alertes). Deux transports :
 *  - SMTP_URL : un service d'envoi transactionnel (ex. smtps://utilisateur:motdepasse@hôte:465) ;
 *  - MAIL_DIR : chaque courriel est écrit dans un fichier JSON (tests, essais en local).
 * Sans l'un ni l'autre, l'app n'envoie aucun courriel : l'inscription se fait alors sans
 * confirmation et la réinitialisation par courriel est indisponible.
 * Les courriels ne contiennent jamais de donnée de santé.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Journalise un envoi en échec sans l'adresse ni le contenu : le message d'erreur SMTP reprend
 * souvent l'adresse du destinataire (« 550 <x@y.ch> recipient rejected »). Seuls les codes restent.
 */
export function logMailError(context: string) {
  return (e: unknown) => {
    const err = (e ?? {}) as { code?: string; responseCode?: number };
    console.error(`[courriel] ${context} : échec`, err.code ?? "", err.responseCode ?? "");
  };
}

/** Transport choisi d'après l'environnement : SMTP_URL d'abord, sinon MAIL_DIR ; null si aucun. */
export function mailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer | null {
  const from = env.MAIL_FROM?.trim() || "Primes LAMal <no-reply@localhost>";
  const smtp = env.SMTP_URL?.trim();
  if (smtp) {
    const transport = nodemailer.createTransport(smtp);
    return {
      async send(mail) {
        await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
      },
    };
  }
  const dir = env.MAIL_DIR?.trim();
  if (dir) return fileMailer(dir, from);
  return null;
}

/** Écrit chaque courriel dans `dir` (un fichier JSON par message, dans l'ordre d'envoi). */
export function fileMailer(dir: string, from = "test@localhost"): Mailer {
  return {
    async send(mail) {
      fs.mkdirSync(dir, { recursive: true });
      const name = `${Date.now()}-${randomBytes(4).toString("hex")}.json`;
      fs.writeFileSync(path.join(dir, name), JSON.stringify({ from, ...mail }, null, 2), { mode: 0o600 });
    },
  };
}
