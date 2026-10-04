import type { Mail, Mailer } from "@/infrastructure/mail/mailer";

/*
 * Textes des courriels de compte. Ils ne contiennent aucune donnée de santé ni d'information sur
 * le foyer : un lien, et de quoi reconnaître un message légitime.
 */

/** Envoi de courriels disponible : un transport et l'adresse publique de l'app (pour les liens). */
export interface MailDeps {
  mailer: Mailer;
  /** Adresse publique de l'app, sans barre finale (ex. https://primes.exemple.ch). */
  appUrl: string;
}

const SIGNATURE = "\n\n— Primes LAMal\nCe message est automatique : n'y répondez pas.";

export function verifyEmailMail(to: string, link: string): Mail {
  return {
    to,
    subject: "Confirmez votre adresse",
    text: `Bonjour,\n\nPour confirmer votre adresse et activer votre compte Primes LAMal, ouvrez ce lien (valable 24 heures) :\n\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.${SIGNATURE}`,
  };
}

export function alreadyRegisteredMail(to: string, loginUrl: string, resetUrl: string): Mail {
  return {
    to,
    subject: "Vous avez déjà un compte",
    text: `Bonjour,\n\nQuelqu'un a voulu créer un compte Primes LAMal avec votre adresse, qui en a déjà un.\n\nSi c'est vous, connectez-vous : ${loginUrl}\nMot de passe oublié : ${resetUrl}\n\nSinon, ignorez ce message : rien n'a été modifié.${SIGNATURE}`,
  };
}

export function resetPasswordMail(to: string, link: string): Mail {
  return {
    to,
    subject: "Réinitialiser votre mot de passe",
    text: `Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure, une seule fois) :\n\n${link}\n\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe reste le même.${SIGNATURE}`,
  };
}

export function passwordResetDoneMail(to: string): Mail {
  return {
    to,
    subject: "Votre mot de passe a été changé",
    text: `Bonjour,\n\nLe mot de passe de votre compte Primes LAMal vient d'être réinitialisé, et tous les appareils ont été déconnectés.\n\nSi vous n'êtes pas à l'origine de ce changement, réinitialisez-le à nouveau sans attendre et prévenez l'administrateur.${SIGNATURE}`,
  };
}

export function newDeviceMail(to: string, device: string, when: string): Mail {
  return {
    to,
    subject: "Nouvelle connexion à votre compte",
    text: `Bonjour,\n\nUne connexion à votre compte Primes LAMal a eu lieu depuis un nouvel appareil :\n\n${device}, le ${when}\n\nSi c'est vous, il n'y a rien à faire. Sinon, changez votre mot de passe et déconnectez les autres appareils dans « Mon compte ».${SIGNATURE}`,
  };
}

export function emailChangeMail(to: string, link: string): Mail {
  return {
    to,
    subject: "Confirmez votre nouvelle adresse",
    text: `Bonjour,\n\nPour utiliser cette adresse avec votre compte Primes LAMal, ouvrez ce lien (valable 24 heures) :\n\n${link}\n\nSi vous n'avez rien demandé, ignorez ce message.${SIGNATURE}`,
  };
}
