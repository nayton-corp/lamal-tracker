"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHouseholdInvitation, leaveHousehold, removeMember, revokeInvitation } from "@/application/invitations";
import { clientIp, rateLimit, requestOrigin } from "@/server/accounts";
import { toActionError, type ActionState } from "@/server/action";
import { requireScope } from "@/server/auth";
import { forgetMode } from "@/server/onboarding";
import { db, nowIso } from "@/server/context";

export type InviteState = { error?: string; link?: string } | null;

/** Lien d'invitation du conjoint, à transmettre soi-même (message, courriel). */
export async function createHouseholdInviteAction(): Promise<InviteState> {
  try {
    const scope = await requireScope();
    rateLimit([`invite:${scope.userId}`, `invite-ip:${await clientIp()}`], 10, 60);
    const code = createHouseholdInvitation(db(), scope, nowIso());
    revalidatePath("/foyer/comptes");
    return { link: `${await requestOrigin()}/inscription?code=${encodeURIComponent(code)}` };
  } catch (e) {
    return { error: toActionError(e)?.error };
  }
}

export async function revokeHouseholdInviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const scope = await requireScope();
    revokeInvitation(db(), scope, Number(form.get("id")), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/foyer/comptes");
  return { ok: "Invitation annulée." };
}

export async function removeMemberAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const scope = await requireScope();
    removeMember(db(), scope, Number(form.get("userId")), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/foyer/comptes");
  return { ok: "Accès retiré." };
}

export async function leaveHouseholdAction(): Promise<ActionState> {
  try {
    const scope = await requireScope();
    leaveHousehold(db(), scope, nowIso());
  } catch (e) {
    return toActionError(e);
  }
  await forgetMode();
  revalidatePath("/", "layout");
  redirect("/bienvenue");
}
