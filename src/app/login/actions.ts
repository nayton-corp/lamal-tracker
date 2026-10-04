"use server";

import { redirect } from "next/navigation";
import { attemptLogin, createFirstAdmin, passwordToDefine, primaryUserId, setPassword } from "@/application/auth";
import type { ActionState } from "@/server/action";
import { toActionError } from "@/server/action";
import { endSession, safeNext, startSession } from "@/server/auth";
import { db, nowIso } from "@/server/context";

/** Premier démarrage : choix du mot de passe, puis session ouverte dans la foulée. */
export async function createPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!passwordToDefine(db())) return { error: "Un mot de passe existe déjà." };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "Les deux saisies ne correspondent pas.", fieldErrors: { confirm: "Différent du mot de passe." } };
  let userId: number;
  try {
    // Mot de passe effacé (oubli) : le compte et son foyer restent, seul le mot de passe change.
    const existing = primaryUserId(db());
    if (existing === null) userId = createFirstAdmin(db(), password);
    else {
      setPassword(db(), existing, password);
      userId = existing;
    }
  } catch (e) {
    return toActionError(e);
  }
  await startSession(userId);
  redirect("/");
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  // Connexion par mot de passe seul : le compte administrateur de l'instance.
  const userId = primaryUserId(db());
  if (userId === null) redirect("/login/creer");
  const res = attemptLogin(db(), userId, String(form.get("password") ?? ""), nowIso());
  if (!res.ok) {
    // Ralentit toute tentative, réussie ou non, sans bloquer le serveur.
    await new Promise((r) => setTimeout(r, 500));
    if (res.lockedSeconds > 0) {
      const min = Math.ceil(res.lockedSeconds / 60);
      return { error: `Trop d'essais : réessayez dans ${min} minute${min > 1 ? "s" : ""}.` };
    }
    return { error: "Mot de passe incorrect." };
  }
  await startSession(userId);
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
