"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getHousehold, getHouseholdMode, listPersons, setHouseholdMode, type HouseholdMode } from "@/application/household";
import { UserError } from "@/application/review";
import { deleteSignature, saveSignature } from "@/application/signatures";
import { saveNeeds, setStrategy } from "@/application/strategy";
import { STRATEGIES, type Strategy } from "@/domain/strategy";
import { chfField, toActionError, type ActionState } from "@/server/action";
import { db, nowIso } from "@/server/context";
import { requireSession } from "@/server/auth";

/** Étape 1 de l'accueil : une personne seule ou un foyer. */
export async function chooseModeAction(form: FormData) {
  await requireSession();
  let mode = String(form.get("mode")) as HouseholdMode;
  // Plusieurs personnes enregistrées : « pour moi seul·e » n'a plus de sens.
  const h = getHousehold(db());
  if (mode === "SOLO" && h && listPersons(db(), h.id).length > 1) mode = "FAMILY";
  if (getHouseholdMode(db()) !== mode) setHouseholdMode(db(), mode);
  revalidatePath("/", "layout");
  redirect(mode === "SOLO" ? "/bienvenue?etape=vous" : "/bienvenue?etape=adresse");
}

export async function chooseStrategyAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  const year = Number(form.get("year"));
  try {
    const strategy = String(form.get("strategy")) as Strategy;
    if (!STRATEGIES.includes(strategy)) throw new UserError("Stratégie inconnue.");
    setStrategy(db(), Number(form.get("reviewId")), strategy);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  redirect(`/rituel/${year}/besoins`);
}

/** Questionnaire des besoins : un groupe de champs par personne, suffixés par l'id de ligne. */
export async function saveNeedsAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  const year = Number(form.get("year"));
  try {
    const lineIds = form.getAll("lineId").map(Number);
    saveNeeds(
      db(),
      Number(form.get("reviewId")),
      lineIds.map((id) => {
        const franchise = String(form.get(`franchise-${id}`) ?? "");
        const health = chfField(form.get(`healthCosts-${id}`));
        const doctor = String(form.get(`doctor-${id}`) ?? "").trim();
        return {
          lineId: id,
          franchiseChf: franchise === "" || franchise === "auto" ? null : Number(franchise),
          models: form.getAll(`models-${id}`).map(String),
          healthCostsRp: health ?? 50000,
          doctorName: doctor || null,
        };
      }),
      nowIso(),
    );
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  redirect(`/rituel/${year}/comparer`);
}

export async function saveSignatureAction(personId: number, dataUrl: string): Promise<ActionState> {
  await requireSession();
  try {
    saveSignature(db(), personId, dataUrl);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Signature enregistrée : elle figure désormais sur les courriers." };
}

export async function deleteSignatureAction(form: FormData) {
  await requireSession();
  deleteSignature(db(), Number(form.get("personId")));
  revalidatePath("/", "layout");
}
