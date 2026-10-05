"use server";

import type { PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { requestEmailChange } from "@/application/account";
import { audit } from "@/application/audit";
import { changePassword, closeOtherSessions, confirmWithPassword, describeDevice, isFreshSession } from "@/application/auth";
import { confirmTotpSetup, disableTotp, regenerateRecoveryCodes, startTotpSetup } from "@/application/mfa";
import { finishPasskeyRegistration, passkeyRegistrationOptions, removePasskey } from "@/application/passkeys";
import { accountDeps, clientIp, deleteCookie, mailDeps, rateLimit, readCookie, relyingParty, writeCookie } from "@/server/accounts";
import { toActionError, type ActionState } from "@/server/action";
import { notifyUserSecurityChange, requireScope } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { headers } from "next/headers";
import { COOKIE } from "@/server/cookie-names";


/** Toute action sensible du compte est limitée en débit, par compte. */
async function guard(name: string) {
  const scope = await requireScope();
  rateLimit([`account:${name}:${scope.userId}`, `account-ip:${await clientIp()}`], 20, 15);
  return scope;
}

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const next = String(form.get("password") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "Les deux saisies du nouveau mot de passe diffèrent.", fieldErrors: { confirm: "Différent du nouveau mot de passe." } };
  try {
    const scope = await guard("password");
    await changePassword(db(), scope.userId, String(form.get("current") ?? ""), next, accountDeps().pwned, scope.sessionId, nowIso());
    await notifyUserSecurityChange(scope.userId, "Le mot de passe de votre compte a été changé");
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/compte");
  return { ok: "Mot de passe modifié. Les autres appareils ont été déconnectés." };
}

export async function changeEmailAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const scope = await guard("email");
    const result = await requestEmailChange(db(), scope.userId, { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") }, mailDeps(), nowIso());
    revalidatePath("/compte");
    return { ok: result === "sent" ? "Un lien de confirmation est parti vers la nouvelle adresse. Elle remplacera l'ancienne une fois confirmée." : "Adresse enregistrée." };
  } catch (e) {
    return toActionError(e);
  }
}

/** Ferme les sessions des autres appareils ; celle-ci reste ouverte. */
export async function logoutOthersAction(): Promise<ActionState> {
  const scope = await requireScope();
  closeOtherSessions(db(), scope.userId, scope.sessionId);
  audit(db(), scope.userId, "SESSIONS_CLOSED", { nowIso: nowIso() });
  revalidatePath("/compte");
  return { ok: "Les autres appareils sont déconnectés." };
}

// ───────────────────────── Double facteur ─────────────────────────

export type TotpSetupState = { error?: string; qr?: string; secret?: string; codes?: string[] } | null;

/** Étape 1 (mot de passe) puis étape 2 (premier code) de l'activation. */
export async function totpSetupAction(_: TotpSetupState, form: FormData): Promise<TotpSetupState> {
  try {
    const scope = await guard("totp");
    if (form.get("step") === "confirm") {
      // Pas de revalidation ici : la page se rafraîchit quand les codes ont été notés.
      const codes = confirmTotpSetup(db(), scope.userId, await readCookie(COOKIE.totp), String(form.get("code") ?? ""), Date.now(), nowIso());
      await deleteCookie(COOKIE.totp);
      await notifyUserSecurityChange(scope.userId, "Le double facteur (codes à usage unique) a été activé sur votre compte");
      return { codes };
    }
    const setup = startTotpSetup(db(), scope.userId, String(form.get("password") ?? ""), nowIso());
    await writeCookie(COOKIE.totp, setup.token, 15 * 60);
    return { secret: setup.secret, qr: await QRCode.toDataURL(setup.uri, { margin: 1, width: 220 }) };
  } catch (e) {
    const err = toActionError(e)?.error;
    // Code erroné : on reste à l'étape 2 avec le même secret.
    if (form.get("step") === "confirm") return { error: err, secret: String(form.get("secret") ?? ""), qr: String(form.get("qr") ?? "") };
    return { error: err };
  }
}

export async function disableTotpAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const scope = await guard("totp");
    disableTotp(db(), scope.userId, String(form.get("password") ?? ""), nowIso());
    await notifyUserSecurityChange(scope.userId, "Le double facteur a été désactivé sur votre compte");
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/compte");
  return { ok: "Double facteur désactivé." };
}

export async function regenerateCodesAction(_: TotpSetupState, form: FormData): Promise<TotpSetupState> {
  try {
    const scope = await guard("totp");
    const codes = regenerateRecoveryCodes(db(), scope.userId, String(form.get("password") ?? ""), nowIso());
    await notifyUserSecurityChange(scope.userId, "De nouveaux codes de secours ont été créés ; les anciens ne valent plus");
    return { codes };
  } catch (e) {
    return { error: toActionError(e)?.error };
  }
}

// ───────────────────────── Passkeys ─────────────────────────

/**
 * Options de création d'une passkey. Le mot de passe est redemandé, sauf dans les dix minutes
 * qui suivent la connexion.
 */
export async function passkeyRegistrationOptionsAction(password: string | null): Promise<{ options?: PublicKeyCredentialCreationOptionsJSON; needPassword?: boolean; error?: string }> {
  try {
    const scope = await guard("passkey");
    if (!isFreshSession(db(), scope.sessionId, nowIso())) {
      if (password === null) return { needPassword: true };
      try {
        confirmWithPassword(db(), scope.userId, scope.sessionId, password, nowIso());
      } catch (e) {
        return { needPassword: true, error: toActionError(e)?.error };
      }
    }
    const { options, token } = await passkeyRegistrationOptions(db(), scope.userId, await relyingParty(), nowIso());
    await writeCookie(COOKIE.webauthn, token, 5 * 60);
    return { options };
  } catch (e) {
    return { error: toActionError(e)?.error };
  }
}

export async function passkeyRegisterAction(response: RegistrationResponseJSON): Promise<{ error?: string }> {
  try {
    const scope = await guard("passkey");
    const token = await readCookie(COOKIE.webauthn);
    await deleteCookie(COOKIE.webauthn);
    const name = describeDevice((await headers()).get("user-agent"));
    await finishPasskeyRegistration(db(), scope.userId, token, response, await relyingParty(), name, nowIso());
    await notifyUserSecurityChange(scope.userId, `Une passkey a été ajoutée à votre compte (${name})`);
  } catch (e) {
    return { error: toActionError(e)?.error };
  }
  revalidatePath("/compte");
  return {};
}

export async function removePasskeyAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const scope = await guard("passkey");
    removePasskey(db(), scope.userId, String(form.get("id") ?? ""), String(form.get("password") ?? ""), nowIso());
    await notifyUserSecurityChange(scope.userId, "Une passkey a été retirée de votre compte");
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/compte");
  return { ok: "Passkey retirée." };
}
