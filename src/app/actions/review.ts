"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { generateLetters } from "@/application/letters";
import { deleteOfferRequest, generateOfferRequests, markOfferRequestAnswered, markOfferRequestSent, setLcaWishes } from "@/application/offers";
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
  getReviewView,
  setLineFlags,
  undoDecision,
} from "@/application/review";
import { nextStep } from "@/app/rituel/_parts/next-step";
import { person, reviewLine } from "@/infrastructure/db/schema";
import { toActionError, chfField, rethrowForeignKey, type ActionState } from "@/server/action";
import { db, nowIso, today } from "@/server/context";
import { requireSession } from "@/server/auth";

/** Après un choix : la personne suivante sans choix, sinon l'étape suivante du rituel (LCA, démarches…). */
function afterDecision(year: number, lineId: number) {
  const line = db().select().from(reviewLine).where(eq(reviewLine.id, lineId)).get();
  if (!line) return done(year);
  const next = db().select().from(reviewLine).where(eq(reviewLine.reviewId, line.reviewId)).all().find((l) => l.decision === "UNDECIDED");
  if (next) return done(year, `/personne/${next.id}`);
  const step = nextStep(getReviewView(db(), line.reviewId, today()));
  revalidatePath("/", "layout");
  redirect(step.kind === "close" || step.kind === "none" ? `/rituel/${year}#ligne-${lineId}` : step.href);
}

function done(year: number, path = "") {
  revalidatePath("/", "layout");
  redirect(`/rituel/${year}${path}`);
}

export async function openReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
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
  await requireSession();
  const year = Number(form.get("year"));
  try {
    decide(db(), Number(form.get("lineId")), { tariffId: Number(form.get("tariffId")), franchiseChf: Number(form.get("franchiseChf")) }, nowIso());
  } catch (e) {
    return toActionError(e);
  }
  afterDecision(year, Number(form.get("lineId")));
  return null;
}

export async function keepAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  const year = Number(form.get("year"));
  try {
    keepAsIs(db(), Number(form.get("lineId")), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  afterDecision(year, Number(form.get("lineId")));
  return null;
}

export async function undoAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    undoDecision(db(), Number(form.get("lineId")));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Décision annulée." };
}

export async function confirmLineageAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    confirmLineage(db(), Number(form.get("lineId")), String(form.get("toCode")));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Tarif de renouvellement confirmé." };
}

export async function acknowledgeLcaAction(lineId: number): Promise<ActionState> {
  await requireSession();
  try {
    acknowledgeLca(db(), lineId, nowIso());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Confirmé." };
}

export async function lineFlagsAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
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
  await requireSession();
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
  await requireSession();
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
  await requireSession();
  try {
    const date = String(form.get("sentAt") || today());
    markLetterSent(db(), Number(form.get("letterId")), date, String(form.get("tracking") ?? "").trim() || null);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Envoi enregistré." };
}

export async function letterAckAction(form: FormData) {
  await requireSession();
  try {
    markLetterAcknowledged(db(), Number(form.get("letterId")), form.get("undo") ? null : today());
  } catch (e) {
    rethrowForeignKey(e, "Cette lettre est encore référencée : impossible de modifier son état.");
  }
  revalidatePath("/", "layout");
}

export async function deleteLetterAction(form: FormData) {
  await requireSession();
  try {
    deleteLetter(db(), Number(form.get("letterId")));
  } catch (e) {
    rethrowForeignKey(e, "Cette lettre est encore référencée : supprimez d'abord ce qui s'y rapporte.");
  }
  revalidatePath("/", "layout");
}

export async function closeReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
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
  await requireSession();
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
  await requireSession();
  const year = Number(form.get("year"));
  try {
    deleteReview(db(), Number(form.get("reviewId")));
  } catch (e) {
    return toActionError(e);
  }
  done(year);
  return null;
}

export async function generateOffersAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const ids = generateOfferRequests(db(), Number(form.get("reviewId")), today());
    revalidatePath("/", "layout");
    return { ok: ids.length ? `${ids.length} demande(s) prête(s).` : "Aucune nouvelle caisse choisie." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function offerSentAction(form: FormData) {
  await requireSession();
  try {
    markOfferRequestSent(db(), Number(form.get("offerId")), form.get("undo") ? null : today());
  } catch (e) {
    rethrowForeignKey(e, "Cette demande d'offre est encore référencée : impossible de modifier son état.");
  }
  revalidatePath("/", "layout");
}

export async function offerAnsweredAction(form: FormData) {
  await requireSession();
  try {
    markOfferRequestAnswered(db(), Number(form.get("offerId")), form.get("undo") ? null : today());
  } catch (e) {
    rethrowForeignKey(e, "Cette demande d'offre est encore référencée : impossible de modifier son état.");
  }
  revalidatePath("/", "layout");
}

export async function deleteOfferAction(form: FormData) {
  await requireSession();
  try {
    deleteOfferRequest(db(), Number(form.get("offerId")));
  } catch (e) {
    rethrowForeignKey(e, "Cette demande d'offre est encore référencée : supprimez d'abord ce qui s'y rapporte.");
  }
  revalidatePath("/", "layout");
}

export async function lcaWishesAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    setLcaWishes(db(), Number(form.get("lineId")), form.getAll("wish").map(String));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Complémentaires à demander enregistrées." };
}

/** Prépare d'un coup les demandes aux nouvelles caisses et les lettres aux caisses actuelles. */
export async function prepareAllAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const reviewId = Number(form.get("reviewId"));
    const offers = generateOfferRequests(db(), reviewId, today());
    const res = generateLetters(db(), reviewId, today());
    revalidatePath("/", "layout");
    if (res.blocked.length) {
      return { error: res.blocked.map((b) => `${b.person} : ${b.reasons.join(" ")}`).join("\n") };
    }
    const n = offers.length + res.created.length;
    return { ok: n ? `${n} courrier(s) prêt(s).` : "Rien de nouveau à préparer." };
  } catch (e) {
    return toActionError(e);
  }
}
