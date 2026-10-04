"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateLetters } from "@/application/letters";
import { abandonPingen, sendLetterViaPingen, syncPingenLetters } from "@/application/pingen";
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
  reviewMembers,
  setHealthCosts,
  setLineFlags,
  undoDecision,
} from "@/application/review";
import { nextStep } from "@/app/rituel/_parts/next-step";
import { toActionError, chfField, rethrowForeignKey, type ActionState } from "@/server/action";
import { db, nowIso, today } from "@/server/context";
import { requireScope } from "@/server/auth";
import { findLine, ownedLetter, type Scope } from "@/application/scope";
import { pingenClient, pingenDeps } from "@/server/pingen";

/** Après un choix : la personne suivante sans choix, sinon l'étape suivante du rituel (LCA, démarches…). */
function afterDecision(scope: Scope, year: number, lineId: number) {
  const line = findLine(db(), scope, lineId);
  if (!line) return done(year);
  const next = reviewMembers(db(), scope, line.reviewId).find((l) => l.decision === "UNDECIDED");
  if (next) return done(year, `/personne/${next.id}`);
  const step = nextStep(getReviewView(db(), scope, line.reviewId, today()));
  revalidatePath("/", "layout");
  redirect(step.kind === "close" || step.kind === "none" ? `/rituel/${year}#ligne-${lineId}` : step.href);
}

function done(year: number, path = "") {
  revalidatePath("/", "layout");
  redirect(`/rituel/${year}${path}`);
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
  done(year);
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

export async function acknowledgeLcaAction(lineId: number): Promise<ActionState> {
  const scope = await requireScope();
  try {
    acknowledgeLca(db(), scope, Number(lineId), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Confirmé." };
}

export async function lineFlagsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const doctor = form.get("doctorCheck");
    setLineFlags(db(), scope, Number(form.get("lineId")), {
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
  const scope = await requireScope();
  try {
    const amount = chfField(form.get("healthCosts"));
    if (amount !== null) setHealthCosts(db(), scope, Number(form.get("lineId")), amount);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Frais attendus enregistrés." };
}

export async function generateLettersAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const res = generateLetters(db(), scope, Number(form.get("reviewId")), today());
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
  const scope = await requireScope();
  try {
    const date = String(form.get("sentAt") || today());
    markLetterSent(db(), scope, Number(form.get("letterId")), date, String(form.get("tracking") ?? "").trim() || null);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Envoi enregistré." };
}

export async function letterAckAction(form: FormData) {
  const scope = await requireScope();
  try {
    markLetterAcknowledged(db(), scope, Number(form.get("letterId")), form.get("undo") ? null : today());
  } catch (e) {
    rethrowForeignKey(e, "Cette lettre est encore référencée : impossible de modifier son état.");
  }
  revalidatePath("/", "layout");
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

export async function closeReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const year = Number(form.get("year"));
  try {
    closeReview(db(), scope, Number(form.get("reviewId")), nowIso());
  } catch (e) {
    return toActionError(e);
  }
  done(year);
  return null;
}

export async function reopenReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const year = Number(form.get("year"));
  try {
    reopenReview(db(), scope, Number(form.get("reviewId")));
  } catch (e) {
    return toActionError(e);
  }
  done(year);
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
  done(year);
  return null;
}

export async function generateOffersAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const ids = generateOfferRequests(db(), scope, Number(form.get("reviewId")), today());
    revalidatePath("/", "layout");
    return { ok: ids.length ? `${ids.length} demande(s) prête(s).` : "Aucune nouvelle caisse choisie." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function offerSentAction(form: FormData) {
  const scope = await requireScope();
  try {
    markOfferRequestSent(db(), scope, Number(form.get("offerId")), form.get("undo") ? null : today());
  } catch (e) {
    rethrowForeignKey(e, "Cette demande d'offre est encore référencée : impossible de modifier son état.");
  }
  revalidatePath("/", "layout");
}

export async function offerAnsweredAction(form: FormData) {
  const scope = await requireScope();
  try {
    markOfferRequestAnswered(db(), scope, Number(form.get("offerId")), form.get("undo") ? null : today());
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
    setLcaWishes(db(), scope, Number(form.get("lineId")), form.getAll("wish").map(String));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Complémentaires à demander enregistrées." };
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
  const client = pingenClient();
  if (!client) return { error: "L'envoi par Pingen n'est pas configuré." };
  try {
    await sendLetterViaPingen(db(), scope, Number(form.get("letterId")), today(), nowIso(), pingenDeps(client));
  } catch (e) {
    revalidatePath("/", "layout");
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: client.staging ? "Lettre transmise à Pingen (environnement de test : rien n'est posté)." : "Lettre transmise à Pingen : elle part en recommandé." };
}

export async function pingenRefreshAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const client = pingenClient();
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
    abandonPingen(db(), scope, Number(form.get("letterId")));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "La lettre est de nouveau à envoyer." };
}
