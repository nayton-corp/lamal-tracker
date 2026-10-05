import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { newDeviceMail, securityChangeMail } from "@/application/account-mail";
import { audit } from "@/application/audit";
import { adminNeedsFactor, closeSession, describeDevice, openSession, passwordToDefine, rememberDevice, SESSION_MAX_DAYS, touchSession, userEmail, type SessionInfo } from "@/application/auth";
import { UserError } from "@/application/errors";
import { requireAdmin as assertAdmin, scopeForUser, type Scope } from "@/application/scope";
import { randomToken } from "@/application/tokens";
import { logMailError } from "@/infrastructure/mail/mailer";
import { deleteCookie, mailDeps, readCookie, writeCookie } from "./accounts";
import { db, nowIso } from "./context";
import { formatTimestamp } from "@/domain/dates";
import { COOKIE } from "./cookie-names";

/*
 * La connexion est obligatoire : sans compte, tout mène à la création du premier ; sans session
 * valable, à la connexion. Le proxy fait ce contrôle pour chaque requête, et les pages et actions
 * serveur le refont elles-mêmes (`pageScope`, `requireScope`), pour ne pas dépendre du seul proxy.
 * Le foyer de chaque requête vient de la session, jamais d'un paramètre du navigateur.
 */
/** Jeton d'appareil de longue durée : reconnaît un appareil déjà utilisé (alerte sinon). */

/** Session du cookie, prolongée au passage ; null si absente ou expirée. */
export async function currentSession(): Promise<SessionInfo | null> {
  return touchSession(db(), await readCookie(COOKIE.session), nowIso());
}

/** Compte et foyer de la requête en cours (une seule lecture par requête). */
export const currentScope = cache(async (): Promise<(Scope & { sessionId: string }) | null> => {
  const s = await currentSession();
  if (!s) return null;
  const scope = scopeForUser(db(), s.userId);
  return scope ? { ...scope, sessionId: s.id } : null;
});

/** À appeler au début de chaque action serveur : refuse tout appel sans session ouverte. */
export async function requireScope(): Promise<Scope & { sessionId: string }> {
  const scope = await currentScope();
  if (!scope) throw new UserError("Session expirée : reconnectez-vous.");
  return scope;
}

/** Actions qui touchent le référentiel partagé (primes, caisses), les comptes ou toute la base. */
export async function requireAdminScope(): Promise<Scope & { sessionId: string }> {
  const scope = await requireScope();
  assertAdmin(scope);
  if (adminNeedsFactor(db(), scope.userId)) throw new UserError("Protégez d'abord votre compte d'un second facteur (Mon compte).");
  return scope;
}

/**
 * Pour les pages : sans session, retour à la connexion ; administrateur sans second facteur,
 * détour par son compte (le proxy le fait déjà, mais pas après la redirection d'une action serveur).
 */
export async function pageScope(): Promise<Scope & { sessionId: string }> {
  const scope = await accountPageScope();
  if (scope.isAdmin && adminNeedsFactor(db(), scope.userId)) redirect("/compte?requis=1");
  return scope;
}

/** Pages du compte : accessibles même à l'administrateur qui doit encore ajouter un facteur. */
export async function accountPageScope(): Promise<Scope & { sessionId: string }> {
  const scope = await currentScope();
  if (!scope) redirect("/login");
  return scope;
}

async function startSession(userId: number, confirmed: boolean): Promise<string> {
  const householdRow = await headers();
  const device = describeDevice(householdRow.get("user-agent"));
  const { token } = openSession(db(), userId, device, nowIso(), confirmed);
  await writeCookie(COOKIE.session, token, SESSION_MAX_DAYS * 86_400);
  return device;
}

/**
 * Connexion réussie (mot de passe et double facteur, passkey, lien de confirmation) : session
 * ouverte, appareil reconnu ou signalé par courriel, événement au journal.
 */
export async function completeLogin(userId: number, { viaEmailLink = false } = {}) {
  const device = await startSession(userId, !viaEmailLink);
  let deviceToken = await readCookie(COOKIE.device);
  if (!deviceToken || deviceToken.length > 100) deviceToken = randomToken(24);
  await writeCookie(COOKIE.device, deviceToken, 400 * 86_400);
  const now = nowIso();
  const { alert } = rememberDevice(db(), userId, deviceToken, now);
  audit(db(), userId, "LOGIN", { detail: device, nowIso: now });
  const mail = mailDeps();
  const email = userEmail(db(), userId);
  if (alert && mail && email) {
    const when = formatTimestamp(now, "dateTimeLong");
    // Un courriel en échec ne doit pas empêcher la connexion.
    await mail.mailer.send(newDeviceMail(email, device, when)).catch(logMailError("alerte de connexion"));
  }
}

/** Où aller après la connexion : le compte d'abord si l'administrateur doit ajouter un facteur. */
export function landingAfterLogin(userId: number, next: string): string {
  return adminNeedsFactor(db(), userId) ? "/compte?requis=1" : next;
}

/** Déconnexion : ferme la session en base et efface le cookie. */
export async function endSession() {
  closeSession(db(), await readCookie(COOKIE.session));
  await deleteCookie(COOKIE.session);
}

/** Pages de connexion : inutiles quand on est déjà connecté. */
export async function redirectIfSignedIn(to = "/") {
  if (await currentSession()) redirect(to);
}

/** Un compte administrateur avec mot de passe existe-t-il ? Sinon, tout mène à sa création. */
export function accountExists(): boolean {
  return !passwordToDefine(db());
}

/**
 * Prévient le titulaire d'un changement de sécurité. Un courriel en échec n'annule pas le
 * changement ; seul le code d'erreur est journalisé (le message SMTP peut contenir l'adresse).
 */
export async function notifySecurityChange(to: string | null, what: string) {
  const mail = mailDeps();
  if (!mail || !to) return;
  await mail.mailer.send(securityChangeMail(to, what, formatTimestamp(nowIso(), "dateTimeLong"))).catch(logMailError("changement de sécurité"));
}

/** Même chose, à partir du compte. */
export async function notifyUserSecurityChange(userId: number, what: string) {
  await notifySecurityChange(userEmail(db(), userId), what);
}

/** Chemin de retour après connexion : seulement un chemin local. */
export function safeNext(next: unknown): string {
  const s = String(next ?? "");
  // Les navigateurs ignorent tabulations et retours à la ligne : « /\t/site.ch » mène ailleurs.
  if (!/^\/(?![/\\])/.test(s) || /[\u0000-\u0020\u007f\\]/.test(s)) return "/";
  const url = new URL(s, "http://app.invalid");
  if (url.origin !== "http://app.invalid") return "/";
  // La normalisation peut recréer un chemin réseau : « /.//site.ch » devient « //site.ch ».
  const path = url.pathname + url.search + url.hash;
  return path.startsWith("//") || path.startsWith("/\\") ? "/" : path;
}
