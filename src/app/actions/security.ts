"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changePassword, closeOtherSessions, verifyPassword } from "@/application/auth";
import { resetHousehold } from "@/application/household";
import { toActionError, type ActionState } from "@/server/action";
import { requireSession } from "@/server/auth";
import { db } from "@/server/context";

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  const next = String(form.get("password") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "Les deux saisies du nouveau mot de passe diffèrent.", fieldErrors: { confirm: "Différent du nouveau mot de passe." } };
  try {
    changePassword(db(), String(form.get("current") ?? ""), next);
  } catch (e) {
    return toActionError(e);
  }
  return { ok: "Mot de passe modifié." };
}

/** Ferme les sessions des autres appareils ; celle-ci reste ouverte. */
export async function logoutOthersAction(): Promise<ActionState> {
  const s = await requireSession();
  closeOtherSessions(db(), s.id);
  revalidatePath("/donnees");
  return { ok: "Les autres appareils sont déconnectés." };
}

/** Remise à zéro : le mot de passe est redemandé, puis tout ce qui a été saisi est effacé. */
export async function resetAllAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  if (!verifyPassword(db(), String(form.get("password") ?? ""))) return { error: "Mot de passe incorrect : rien n'a été effacé." };
  resetHousehold(db());
  revalidatePath("/", "layout");
  redirect("/bienvenue");
}
