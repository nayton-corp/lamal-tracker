"use server";

import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmWithPassword, markConfirmed, requireConfirmed } from "@/application/auth";
import { deleteOwnAccount } from "@/application/data-rights";
import { resetHousehold } from "@/application/household";
import { finishPasskeyConfirm, passkeyConfirmOptions } from "@/application/passkeys";
import { clientIp, deleteCookie, mailDeps, rateLimit, readCookie, relyingParty, writeCookie } from "@/server/accounts";
import { toActionError, type ActionState } from "@/server/action";
import { endSession, requireScope } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { forgetMode } from "@/server/onboarding";

const WEBAUTHN_COOKIE = "lamal_wa";

async function guard(name: string) {
  const scope = await requireScope();
  rateLimit([`data:${name}:${scope.userId}`, `data-ip:${await clientIp()}`], 20, 15);
  return scope;
}

/** Confirmation de l'identité par mot de passe : ouvre export et suppression pour 10 minutes. */
export async function confirmPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const scope = await guard("confirm");
    confirmWithPassword(db(), scope.userId, scope.sessionId, String(form.get("password") ?? ""), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/compte/donnees");
  return { ok: "Identité confirmée." };
}

export async function confirmPasskeyOptionsAction(): Promise<{ options?: PublicKeyCredentialRequestOptionsJSON; error?: string }> {
  try {
    const scope = await guard("confirm");
    const { options, token } = await passkeyConfirmOptions(db(), scope.userId, await relyingParty(), nowIso());
    await writeCookie(WEBAUTHN_COOKIE, token, 5 * 60);
    return { options };
  } catch (e) {
    return { error: toActionError(e)?.error };
  }
}

export async function confirmPasskeyAction(response: AuthenticationResponseJSON): Promise<{ error?: string }> {
  try {
    const scope = await guard("confirm");
    const token = await readCookie(WEBAUTHN_COOKIE);
    await deleteCookie(WEBAUTHN_COOKIE);
    if (!(await finishPasskeyConfirm(db(), scope.userId, token, response, await relyingParty(), nowIso()))) return { error: "Passkey non reconnue : réessayez, ou confirmez avec votre mot de passe." };
    markConfirmed(db(), scope.sessionId, nowIso());
  } catch (e) {
    return { error: toActionError(e)?.error };
  }
  revalidatePath("/compte/donnees");
  return {};
}

/** Suppression du foyer (propriétaire) : tout ce qui a été saisi, pour tous ses comptes. */
export async function deleteHouseholdAction(): Promise<ActionState> {
  try {
    const scope = await guard("household");
    requireConfirmed(db(), scope.sessionId, nowIso());
    resetHousehold(db(), scope, nowIso());
  } catch (e) {
    return toActionError(e);
  }
  await forgetMode();
  revalidatePath("/", "layout");
  redirect("/bienvenue");
}

/** Suppression du compte : la session se ferme, retour à la page de connexion. */
export async function deleteAccountAction(): Promise<ActionState> {
  try {
    const scope = await guard("account");
    await deleteOwnAccount(db(), scope, scope.sessionId, mailDeps(), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  // Les sessions du compte ont disparu avec lui ; reste à effacer le cookie.
  await endSession();
  await forgetMode();
  redirect("/login?supprime=1");
}
