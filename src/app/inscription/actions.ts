"use server";

import { redirect } from "next/navigation";
import { confirmEmail, signUp, type EmailConfirmation } from "@/application/account";
import { hasStrongFactor } from "@/application/auth";
import { accountDeps, clientIp, rateLimit } from "@/server/accounts";
import { toActionError, type ActionState } from "@/server/action";
import { completeLogin, notifySecurityChange } from "@/server/auth";
import { db, nowIso } from "@/server/context";

export async function signUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "Les deux saisies ne correspondent pas.", fieldErrors: { confirm: "Différent du mot de passe." } };
  let result;
  try {
    rateLimit([`signup-ip:${await clientIp()}`], 10, 60);
    result = await signUp(
      db(),
      { code: String(form.get("code") ?? ""), email: String(form.get("email") ?? ""), password, consent: form.get("consent") === "on" },
      accountDeps(),
      nowIso(),
    );
  } catch (e) {
    return toActionError(e);
  }
  if (result.kind === "check-mail") redirect("/inscription/envoye");
  await completeLogin(result.userId);
  redirect("/compte/passkey");
}

/**
 * Clic sur « Confirmer » depuis le lien du courriel (jamais à la simple ouverture du lien : les
 * antivirus de messagerie ouvrent les liens). Un nouveau compte est connecté dans la foulée ; un
 * compte déjà protégé par un second facteur repasse par la connexion.
 */
export async function confirmEmailAction(_: ActionState, form: FormData): Promise<ActionState> {
  let confirmation: EmailConfirmation;
  try {
    rateLimit([`verify-ip:${await clientIp()}`], 20, 60);
    confirmation = confirmEmail(db(), String(form.get("t") ?? ""), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  const { userId, autoLogin, previousEmail } = confirmation;
  if (previousEmail) await notifySecurityChange(previousEmail, `L'adresse de connexion de votre compte a été remplacée par une autre`);
  if (!autoLogin || hasStrongFactor(db(), userId)) redirect("/login?confirme=1");
  await completeLogin(userId, { viaEmailLink: true });
  redirect("/compte/passkey");
}
