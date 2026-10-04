"use server";

import { revalidatePath } from "next/cache";
import { markFeedback, sendFeedback } from "@/application/feedback";
import { mailDeps, rateLimit } from "@/server/accounts";
import { toActionError, type ActionState } from "@/server/action";
import { requireAdminScope, requireScope } from "@/server/auth";
import { db, nowIso } from "@/server/context";

export async function sendFeedbackAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const scope = await requireScope();
    rateLimit([`avis:${scope.userId}`], 10, 60);
    await sendFeedback(db(), scope, { kind: form.get("kind"), message: form.get("message"), page: form.get("page") || null }, mailDeps(), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin");
  return { ok: "Merci ! Votre avis est bien arrivé." };
}

export async function markFeedbackAction(form: FormData) {
  const scope = await requireAdminScope();
  const action = String(form.get("action"));
  if (action !== "read" && action !== "unread" && action !== "delete") return;
  markFeedback(db(), scope, Number(form.get("id")), action, nowIso());
  revalidatePath("/admin");
}
