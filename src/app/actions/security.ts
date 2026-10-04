"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifyPassword } from "@/application/auth";
import { resetHousehold } from "@/application/household";
import { toActionError, type ActionState } from "@/server/action";
import { requireScope } from "@/server/auth";
import { forgetMode } from "@/server/onboarding";
import { db } from "@/server/context";

/** Remise à zéro : le mot de passe est redemandé, puis tout ce qui a été saisi est effacé. */
export async function resetAllAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  if (!verifyPassword(db(), scope.userId, String(form.get("password") ?? ""))) return { error: "Mot de passe incorrect : rien n'a été effacé." };
  try {
    if (scope.householdId !== null) resetHousehold(db(), scope);
  } catch (e) {
    return toActionError(e);
  }
  await forgetMode();
  revalidatePath("/", "layout");
  redirect("/bienvenue");
}
