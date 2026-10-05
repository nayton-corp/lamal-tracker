"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteLetter, generateLetters, markLetterSent } from "@/application/letters";
import { abandonPingen, sendLetterViaPingen, syncPingenLetters } from "@/application/pingen";
import { deleteOfferRequest, generateOfferRequests, listOfferRequests, markOfferRequestSent, setLcaWishes } from "@/application/offers";
import {
  deleteReview,
  confirmLineage,
  decide,
  keepAsIs,
  openReview,
  reopenReview,
  getReviewView,
  listReviewLineTabs,
  syncReviewClosure,
  undoDecision,
} from "@/application/review";
import { nextStep } from "@/app/bilan/_parts/next-step";
import { toActionError, rethrowForeignKey, type ActionState } from "@/server/action";
import { db, nowIso, today } from "@/server/context";
import { requireScope } from "@/server/auth";
import { findLine, findLetter, findOfferRequest, ownedLetter, type Scope } from "@/application/scope";
import { pingenClientFor, pingenDeps } from "@/server/pingen";

/**
 * Après un choix : la personne suivante sans choix, sinon l'étape suivante du bilan (démarches).
 * Si tout le monde garde son contrat, il n'y a rien à envoyer : le bilan se clôt aussitôt.
 */
function afterDecision(scope: Scope, year: number, lineId: number) {
  const line = findLine(db(), scope, lineId);
  if (!line) return redirectToReview(year);
  const next = listReviewLineTabs(db(), scope, line.reviewId).find((l) => l.decision === "UNDECIDED");
  if (next) return redirectToReview(year, `/personne/${next.id}`);
  if (syncReviewClosure(db(), scope, line.reviewId, today(), nowIso()) === "closed") return redirectToReview(year);
  const step = nextStep(getReviewView(db(), scope, line.reviewId, today()));
  revalidatePath("/", "layout");
  redirect(step.kind === "none" ? `/bilan/${year}#ligne-${lineId}` : step.href);
}

/** Clôt (ou rouvre) le bilan d'un courrier selon l'avancement ; message à afficher s'il vient de se clore. */
function syncAfterSending(scope: Scope, reviewId: number | undefined): string | null {
  if (reviewId === undefined) return null;
  return syncReviewClosure(db(), scope, reviewId, today(), nowIso()) === "closed" ? "Tout est envoyé : le bilan est terminé et vos nouveaux contrats sont enregistrés." : null;
}

function redirectToReview(year: number, path = "") {
  revalidatePath("/", "layout");
  redirect(`/bilan/${year}${path}`);
}

export async function openReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const year = Number(form.get("year"));
  try {
    const { skipped } = openReview(db(), scope, year);
    if (skipped.length) {
      revalidatePath("/", "layout");
      return { error: `Personnes non incluses : ${skipped.join(", ")}. Ajoutez leur contrat dans Foyer.` };
    }
  } catch (e) {
    return toActionError(e);
  }
  redirectToReview(year);
  return null;
}

export async function decideAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const year = Number(form.get("year"));
  try {
    decide(db(), scope, Number(form.get("lineId")), { tariffId: Number(form.get("tariffId")), franchiseChf: Number(form.get("franchiseChf")) }, nowIso());
  } catch (e) {
    return toActionError(e);
  }
  afterDecision(scope, year, Number(form.get("lineId")));
  return null;
}

export async function keepAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const year = Number(form.get("year"));
  try {
    keepAsIs(db(), scope, Number(form.get("lineId")), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  afterDecision(scope, year, Number(form.get("lineId")));
  return null;
}

export async function undoAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    undoDecision(db(), scope, Number(form.get("lineId")));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Décision annulée." };
}

export async function confirmLineageAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    confirmLineage(db(), scope, Number(form.get("lineId")), String(form.get("toCode")));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Tarif de renouvellement confirmé." };
}

export async function letterSentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const date = String(form.get("sentAt") || today());
    const letterId = Number(form.get("letterId"));
    markLetterSent(db(), scope, letterId, date, String(form.get("tracking") ?? "").trim() || null);
    const done = syncAfterSending(scope, findLetter(db(), scope, letterId)?.reviewId);
    revalidatePath("/", "layout");
    return { ok: done ?? "Envoi enregistré." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteLetterAction(form: FormData) {
  const scope = await requireScope();
  try {
    deleteLetter(db(), scope, Number(form.get("letterId")));
  } catch (e) {
    rethrowForeignKey(e, "Cette lettre est encore référencée : supprimez d'abord ce qui s'y rapporte.");
  }
  revalidatePath("/", "layout");
}

export async function reopenReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const year = Number(form.get("year"));
  try {
    reopenReview(db(), scope, Number(form.get("reviewId")));
  } catch (e) {
    return toActionError(e);
  }
  redirectToReview(year);
  return null;
}

export async function deleteReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const year = Number(form.get("year"));
  try {
    deleteReview(db(), scope, Number(form.get("reviewId")));
  } catch (e) {
    return toActionError(e);
  }
  redirectToReview(year);
  return null;
}

export async function offerSentAction(form: FormData) {
  const scope = await requireScope();
  try {
    const offerId = Number(form.get("offerId"));
    markOfferRequestSent(db(), scope, offerId, form.get("undo") ? null : today());
    syncAfterSending(scope, findOfferRequest(db(), scope, offerId)?.reviewId);
  } catch (e) {
    rethrowForeignKey(e, "Cette demande d'offre est encore référencée : impossible de modifier son état.");
  }
  revalidatePath("/", "layout");
}

export async function deleteOfferAction(form: FormData) {
  const scope = await requireScope();
  try {
    deleteOfferRequest(db(), scope, Number(form.get("offerId")));
  } catch (e) {
    rethrowForeignKey(e, "Cette demande d'offre est encore référencée : supprimez d'abord ce qui s'y rapporte.");
  }
  revalidatePath("/", "layout");
}

export async function lcaWishesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const lineId = Number(form.get("lineId"));
    setLcaWishes(db(), scope, lineId, form.getAll("wish").map(String));
    // Demandes déjà préparées : refaites pour inclure les complémentaires (celles envoyées ne bougent pas).
    const reviewId = findLine(db(), scope, lineId)?.reviewId;
    if (reviewId !== undefined && listOfferRequests(db(), scope, reviewId).some((o) => !o.sentAt)) generateOfferRequests(db(), scope, reviewId, today());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Complémentaires ajoutées à la demande." };
}

/** Prépare d'un coup les demandes aux nouvelles caisses et les lettres aux caisses actuelles. */
export async function prepareAllAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const reviewId = Number(form.get("reviewId"));
    const offers = generateOfferRequests(db(), scope, reviewId, today());
    const res = generateLetters(db(), scope, reviewId, today());
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

export async function pingenSendAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const client = pingenClientFor(scope);
  if (!client) return { error: "L'envoi par Pingen n'est pas configuré." };
  try {
    const letterId = Number(form.get("letterId"));
    await sendLetterViaPingen(db(), scope, letterId, today(), nowIso(), pingenDeps(client));
    syncAfterSending(scope, findLetter(db(), scope, letterId)?.reviewId);
  } catch (e) {
    revalidatePath("/", "layout");
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: client.staging ? "Lettre transmise à Pingen (environnement de test : rien n'est posté)." : "Lettre transmise à Pingen : elle part en recommandé." };
}

export async function pingenRefreshAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const client = pingenClientFor(scope);
  if (!client) return { error: "L'envoi par Pingen n'est pas configuré." };
  let letterId: number;
  try {
    letterId = ownedLetter(db(), scope, Number(form.get("letterId"))).id;
  } catch (e) {
    return toActionError(e);
  }
  const result = await syncPingenLetters(db(), client, nowIso(), letterId);
  revalidatePath("/", "layout");
  if (result.errors.length) return { error: `Pingen n'a pas pu être consulté : ${result.errors[0]}` };
  return { ok: "Suivi mis à jour." };
}

export async function pingenAbandonAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const letterId = Number(form.get("letterId"));
    abandonPingen(db(), scope, letterId);
    syncAfterSending(scope, findLetter(db(), scope, letterId)?.reviewId);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "La lettre est de nouveau à envoyer." };
}
