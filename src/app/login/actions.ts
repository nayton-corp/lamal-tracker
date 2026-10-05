"use server";

import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import { redirect } from "next/navigation";
import { requestPasswordReset, resendVerification, resetPassword } from "@/application/account";
import { checkNewPassword, createFirstAdmin, hasStrongFactor, login, normalizeEmail, passwordToDefine, primaryUserId, setPassword } from "@/application/auth";
import { finishMfaLogin, startMfaLogin } from "@/application/mfa";
import { finishPasskeyLogin, passkeyLoginOptions } from "@/application/passkeys";
import { accountDeps, clientIp, DIRECT_CLIENT, deleteCookie, mailDeps, rateLimit, readCookie, relyingParty, setupCodeMatches, writeCookie } from "@/server/accounts";
import type { ActionState } from "@/server/action";
import { toActionError } from "@/server/action";
import { completeLogin, endSession, landingAfterLogin, safeNext } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { COOKIE } from "@/server/cookie-names";


/** Ralentit chaque échec, sans bloquer le serveur. */
const slowDown = () => new Promise((r) => setTimeout(r, 500));

/**
 * Premier démarrage : courriel et mot de passe de l'administrateur, puis session ouverte. Après la
 * procédure « mot de passe oublié » du README, seul le mot de passe est redemandé.
 */
export async function createPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!passwordToDefine(db())) return { error: "Un mot de passe existe déjà." };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "Les deux saisies ne correspondent pas.", fieldErrors: { confirm: "Différent du mot de passe." } };
  let userId: number;
  try {
    rateLimit([`creer:${await clientIp()}`], 10, 15);
    // Serveur exposé sur Internet : sans le code d'installation, personne d'autre ne prend la main.
    if (!setupCodeMatches(form.get("setup"))) {
      await slowDown();
      return { error: "Code d'installation incorrect.", fieldErrors: { setup: "Code incorrect." } };
    }
    await checkNewPassword(password, accountDeps().pwned);
    // Mot de passe effacé (oubli) : le compte et son foyer restent, seul le mot de passe change.
    const existing = primaryUserId(db());
    if (existing === null) userId = createFirstAdmin(db(), normalizeEmail(form.get("email")), password, nowIso());
    else {
      setPassword(db(), existing, password);
      userId = existing;
    }
  } catch (e) {
    return toActionError(e);
  }
  // Compte déjà protégé d'un second facteur : il reste exigé, la connexion passe par /login.
  if (hasStrongFactor(db(), userId)) redirect("/login?reinitialise=1");
  await completeLogin(userId);
  redirect(landingAfterLogin(userId, "/"));
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "");
  const next = safeNext(form.get("next"));
  const mail = mailDeps();
  let outcome;
  try {
    rateLimit([`login-ip:${await clientIp()}`], 30, 15);
    rateLimit([`login-email:${email.trim().toLowerCase()}`], 10, 15);
    outcome = login(db(), { email, password: String(form.get("password") ?? "") }, { nowIso: nowIso(), mailEnabled: mail !== null });
  } catch (e) {
    return toActionError(e);
  }
  switch (outcome.kind) {
    case "refused": {
      await slowDown();
      if (outcome.lockedSeconds > 0) {
        const min = Math.ceil(outcome.lockedSeconds / 60);
        return { error: `Trop d'essais : réessayez dans ${min} minute${min > 1 ? "s" : ""}.` };
      }
      return { error: email.trim() ? "Courriel ou mot de passe incorrect." : "Mot de passe incorrect." };
    }
    case "passkey":
      return { error: "Ce compte administrateur se connecte avec sa passkey : touchez « Se connecter avec une passkey »." };
    case "unverified":
      if (mail) await resendVerification(db(), outcome.userId, mail, nowIso());
      return { error: "Confirmez d'abord votre adresse : le lien de confirmation vient de vous être renvoyé (pensez aux courriels indésirables)." };
    case "mfa":
      await writeCookie(COOKIE.mfa, startMfaLogin(db(), outcome.userId, nowIso()), 5 * 60);
      redirect(`/login/code?next=${encodeURIComponent(next)}`);
    case "ok":
      await completeLogin(outcome.userId);
      redirect(landingAfterLogin(outcome.userId, next));
  }
}

/** Deuxième étape : code de l'application d'authentification, ou code de secours. */
export async function mfaAction(_: ActionState, form: FormData): Promise<ActionState> {
  const token = await readCookie(COOKIE.mfa);
  let outcome;
  try {
    rateLimit([`mfa-ip:${await clientIp()}`], 30, 15);
    outcome = finishMfaLogin(db(), token, String(form.get("code") ?? ""), Date.now(), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  if (!outcome.ok) {
    await slowDown();
    if (outcome.restart) await deleteCookie(COOKIE.mfa);
    return { error: outcome.error, ...(outcome.restart ? { ok: "restart" } : {}) };
  }
  await deleteCookie(COOKIE.mfa);
  await completeLogin(outcome.userId);
  redirect(landingAfterLogin(outcome.userId, safeNext(form.get("next"))));
}

/** Connexion par passkey, étape 1 : le défi à signer par l'appareil. */
export async function passkeyLoginOptionsAction(): Promise<{ options?: PublicKeyCredentialRequestOptionsJSON; error?: string }> {
  try {
    // Sans mandataire, toutes les requêtes partagent la même « IP » : limiter ici bloquerait les
    // passkeys de tout le monde. Une passkey ne se devine pas ; la limite ne sert qu'à freiner.
    const ip = await clientIp();
    if (ip !== DIRECT_CLIENT) rateLimit([`passkey-ip:${ip}`], 30, 15);
    const { options, token } = await passkeyLoginOptions(db(), await relyingParty(), nowIso());
    await writeCookie(COOKIE.webauthn, token, 5 * 60);
    return { options };
  } catch (e) {
    return { error: toActionError(e)?.error };
  }
}

/** Connexion par passkey, étape 2 : la réponse de l'appareil ouvre la session. */
export async function passkeyLoginAction(response: AuthenticationResponseJSON, next: string): Promise<{ error?: string }> {
  const mail = mailDeps();
  const token = await readCookie(COOKIE.webauthn);
  await deleteCookie(COOKIE.webauthn);
  const result = await finishPasskeyLogin(db(), token, response, await relyingParty(), { nowIso: nowIso(), mailEnabled: mail !== null });
  if (!result.ok) {
    if (result.unverifiedUserId && mail) await resendVerification(db(), result.unverifiedUserId, mail, nowIso());
    await slowDown();
    return { error: result.error };
  }
  await completeLogin(result.userId);
  redirect(landingAfterLogin(result.userId, safeNext(next)));
}

/** Mot de passe oublié : la réponse est la même, que l'adresse ait un compte ou non. */
export async function forgotPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const mail = mailDeps();
  if (!mail) return { error: "La réinitialisation par courriel n'est pas disponible sur cette instance : demandez à l'administrateur." };
  const email = String(form.get("email") ?? "");
  try {
    rateLimit([`forgot-ip:${await clientIp()}`], 10, 60);
    rateLimit([`forgot-email:${email.trim().toLowerCase()}`], 3, 60);
    await requestPasswordReset(db(), email, mail, nowIso());
  } catch (e) {
    return toActionError(e);
  }
  return { ok: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'y être envoyé. Il est valable une heure." };
}

export async function resetPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "Les deux saisies ne correspondent pas.", fieldErrors: { confirm: "Différent du mot de passe." } };
  try {
    rateLimit([`reset-ip:${await clientIp()}`], 20, 60);
    await resetPassword(db(), { token: String(form.get("t") ?? ""), password, code: String(form.get("code") ?? "") }, accountDeps(), { iso: nowIso(), ms: Date.now() });
  } catch (e) {
    return toActionError(e);
  }
  redirect("/login?reinitialise=1");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
