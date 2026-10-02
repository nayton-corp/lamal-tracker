"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { generateLetters } from "@/application/letters";
import {
  acknowledgeLca,
  closeReview,
  deleteReview,
  confirmLineage,
  decide,
  deleteLetter,
  keepAsIs,
  markLetterAcknowledged,
  markLetterSent,
  openReview,
  reopenReview,
  setLineFlags,
  undoDecision,
} from "@/application/review";
import { person, reviewLine } from "@/infrastructure/db/schema";
import { toActionError, chfField, type ActionState } from "@/server/action";
import { db, nowIso, today } from "@/server/context";

function done(year: number, path = "") {
  revalidatePath("/", "layout");
  redirect(`/rituel/${year}${path}`);
}

export async function openReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const year = Number(form.get("year"));
  try {
    const { skipped } = openReview(db(), year);
    if (skipped.length) {
      revalidatePath("/", "layout");
      return { error: `Personnes non incluses : ${skipped.join(", ")}. Ajoutez leur contrat dans Foyer.` };
    }
  } catch (e) {
    return toActionError(e);
  }
  done(year);
  return null;
}

export async function decideAction(_: ActionState, form: FormData): Promise<ActionState> {
  const year = Number(form.get("year"));
  try {
    decide(db(), Number(form.get("lineId")), { tariffId: Number(form.get("tariffId")), franchiseChf: Number(form.get("franchiseChf")) }, nowIso());
  } catch (e) {
    return toActionError(e);
  }
  done(year, `#ligne-${form.get("lineId")}`);
  return null;
}

export async function keepAction(_: ActionState, form: FormData): Promise<ActionState> {
  const year = Number(form.get("year"));
  try {
    keepAsIs(db(), Number(form.get("lineId")), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  done(year, `#ligne-${form.get("lineId")}`);
  return null;
}

export async function undoAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    undoDecision(db(), Number(form.get("lineId")));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Décision annulée." };
}

export async function confirmLineageAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    confirmLineage(db(), Number(form.get("lineId")), String(form.get("toCode")));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Tarif de renouvellement confirmé." };
}

export async function acknowledgeLcaAction(lineId: number): Promise<ActionState> {
  try {
    acknowledgeLca(db(), lineId, nowIso());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Confirmé." };
}

export async function lineFlagsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const doctor = form.get("doctorCheck");
    setLineFlags(db(), Number(form.get("lineId")), {
      ...(doctor ? { doctorCheck: String(doctor) as "YES" | "NO" | "UNKNOWN" } : {}),
      ...(form.has("affiliation") ? { affiliationRequestedAt: form.get("affiliation") === "on" ? today() : null } : {}),
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Enregistré." };
}

export async function healthCostsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const line = db().select().from(reviewLine).where(eq(reviewLine.id, Number(form.get("lineId")))).get();
    const amount = chfField(form.get("healthCosts"));
    if (line && amount !== null) db().update(person).set({ healthCostsRp: amount }).where(eq(person.id, line.personId)).run();
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Frais attendus enregistrés." };
}

export async function generateLettersAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const res = generateLetters(db(), Number(form.get("reviewId")), today());
    revalidatePath("/", "layout");
    if (res.blocked.length) {
      return { error: res.blocked.map((b) => `${b.person} : ${b.reasons.join(" ")}`).join("\n") };
    }
    return { ok: res.created.length ? `${res.created.length} lettre(s) prête(s).` : "Aucune lettre à générer." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function letterSentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const date = String(form.get("sentAt") || today());
  markLetterSent(db(), Number(form.get("letterId")), date, String(form.get("tracking") ?? "").trim() || null);
  revalidatePath("/", "layout");
  return { ok: "Envoi enregistré." };
}

export async function letterAckAction(form: FormData) {
  markLetterAcknowledged(db(), Number(form.get("letterId")), form.get("undo") ? null : today());
  revalidatePath("/", "layout");
}

export async function deleteLetterAction(form: FormData) {
  deleteLetter(db(), Number(form.get("letterId")));
  revalidatePath("/", "layout");
}

export async function closeReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const year = Number(form.get("year"));
  try {
    closeReview(db(), Number(form.get("reviewId")), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  done(year);
  return null;
}

export async function reopenReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const year = Number(form.get("year"));
  try {
    reopenReview(db(), Number(form.get("reviewId")));
  } catch (e) {
    return toActionError(e);
  }
  done(year);
  return null;
}

export async function deleteReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const year = Number(form.get("year"));
  try {
    deleteReview(db(), Number(form.get("reviewId")));
  } catch (e) {
    return toActionError(e);
  }
  done(year);
  return null;
}
