"use server";

import { revalidatePath } from "next/cache";
import { setAccountDisabled, setPingenAllowed } from "@/application/admin";
import { createSignupInvitation, revokeInvitation } from "@/application/invitations";
import { requestOrigin } from "@/server/accounts";
import { toActionError, type ActionState } from "@/server/action";
import { requireAdminScope } from "@/server/auth";
import { db, nowIso } from "@/server/context";

export type SignupInviteState = { error?: string; fieldErrors?: Record<string, string>; link?: string } | null;

export async function createSignupInviteAction(_: SignupInviteState, form: FormData): Promise<SignupInviteState> {
  try {
    const scope = await requireAdminScope();
    const code = createSignupInvitation(db(), scope, { label: String(form.get("label") ?? ""), maxUses: String(form.get("maxUses") ?? "1"), days: String(form.get("days") ?? "14") }, nowIso());
    revalidatePath("/admin");
    return { link: `${await requestOrigin()}/inscription?code=${encodeURIComponent(code)}` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeSignupInviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const scope = await requireAdminScope();
    revokeInvitation(db(), scope, Number(form.get("id")), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin");
  return { ok: "Invitation révoquée." };
}

export async function setAccountDisabledAction(_: ActionState, form: FormData): Promise<ActionState> {
  const disabled = form.get("disabled") === "true";
  try {
    const scope = await requireAdminScope();
    setAccountDisabled(db(), scope, Number(form.get("userId")), disabled, nowIso());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin");
  return { ok: disabled ? "Compte suspendu." : "Compte réactivé." };
}

export async function setPingenAction(_: ActionState, form: FormData): Promise<ActionState> {
  const allowed = form.get("allowed") === "true";
  try {
    const scope = await requireAdminScope();
    setPingenAllowed(db(), scope, Number(form.get("householdId")), allowed);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin");
  return { ok: allowed ? "Envoi Pingen activé pour ce foyer." : "Envoi Pingen retiré à ce foyer." };
}
