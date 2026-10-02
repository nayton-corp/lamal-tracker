"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setHouseholdMode, type HouseholdMode } from "@/application/household";
import { analyzePolicyText, type PolicyImport } from "@/application/policy-import";
import { UserError } from "@/application/review";
import { deleteSignature, saveSignature } from "@/application/signatures";
import { saveNeeds, setStrategy } from "@/application/strategy";
import { STRATEGIES, type Strategy } from "@/domain/strategy";
import { chfField, toActionError, type ActionState } from "@/server/action";
import { db, nowIso, today } from "@/server/context";

/** Étape 1 de l'accueil : une personne seule ou un foyer. */
export async function chooseModeAction(form: FormData) {
  setHouseholdMode(db(), String(form.get("mode")) as HouseholdMode);
  revalidatePath("/", "layout");
  redirect("/bienvenue?etape=adresse");
}

export async function chooseStrategyAction(_: ActionState, form: FormData): Promise<ActionState> {
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
  try {
    saveSignature(db(), personId, dataUrl);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Signature enregistrée : elle figure désormais sur les courriers." };
}

export async function deleteSignatureAction(form: FormData) {
  deleteSignature(db(), Number(form.get("personId")));
  revalidatePath("/", "layout");
}

/** Texte lu sur une photo (OCR fait sur l'appareil) : même analyse qu'un PDF. */
export async function analyzePolicyTextAction(text: string): Promise<{ result?: PolicyImport; error?: string }> {
  if (typeof text !== "string" || text.length > 200_000) return { error: "Texte illisible." };
  try {
    return { result: analyzePolicyText(db(), text, Number(today().slice(0, 4))) };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message.replace(/ce PDF ne contient pas de texte lisible.*/i, "Le texte de la photo est illisible : reprenez-la bien à plat, nette et éclairée.") };
    return { error: "Lecture impossible." };
  }
}
