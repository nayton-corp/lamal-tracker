"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getHousehold, getHouseholdMode, listPersons, setHouseholdMode, type HouseholdMode } from "@/application/household";
import { UserError } from "@/application/errors";
import { deleteSignature, saveSignature } from "@/application/signatures";
import { savePreferences } from "@/application/strategy";
import { DEFAULT_HEALTH_COSTS_RP } from "@/domain/lamal";
import { STRATEGIES, type Strategy } from "@/domain/strategy";
import { chfField, toActionError, type ActionState } from "@/server/action";
import { db, nowIso } from "@/server/context";
import { requireScope } from "@/server/auth";
import { rememberMode } from "@/server/onboarding";

/** Étape 1 de l'accueil : une personne seule ou un foyer. */
export async function chooseModeAction(form: FormData) {
  const scope = await requireScope();
  let mode = String(form.get("mode")) as HouseholdMode;
  // Plusieurs personnes enregistrées : « pour moi seul·e » n'a plus de sens.
  const householdRow = getHousehold(db(), scope);
  if (mode === "SOLO" && householdRow && listPersons(db(), householdRow.id).length > 1) mode = "FAMILY";
  // Avant que le foyer existe, le choix attend sa création (voir saveHouseholdAction).
  if (householdRow) {
    if (getHouseholdMode(db(), scope) !== mode) setHouseholdMode(db(), scope, mode);
  } else await rememberMode(mode);
  revalidatePath("/", "layout");
  redirect(mode === "SOLO" ? "/bienvenue?etape=vous" : "/bienvenue?etape=adresse");
}

/** Préférences du bilan : la stratégie, puis un groupe de champs par personne, suffixés par l'id de ligne. */
export async function savePreferencesAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  const year = Number(form.get("year"));
  try {
    const strategy = String(form.get("strategy")) as Strategy;
    if (!STRATEGIES.includes(strategy)) throw new UserError("Choisissez ce qui compte le plus pour vous.");
    const lineIds = form.getAll("lineId").map(Number);
    savePreferences(
      db(),
      scope,
      Number(form.get("reviewId")),
      strategy,
      lineIds.map((id) => {
        const franchise = String(form.get(`franchise-${id}`) ?? "");
        const health = chfField(form.get(`healthCosts-${id}`));
        const doctor = String(form.get(`doctor-${id}`) ?? "").trim();
        return {
          lineId: id,
          franchiseChf: franchise === "" || franchise === "auto" ? null : Number(franchise),
          models: form.getAll(`models-${id}`).map(String),
          healthCostsRp: health ?? DEFAULT_HEALTH_COSTS_RP,
          doctorName: doctor || null,
        };
      }),
      nowIso(),
    );
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  redirect(`/bilan/${year}/comparer`);
}

export async function saveSignatureAction(personId: number, dataUrl: string): Promise<ActionState> {
  const scope = await requireScope();
  try {
    saveSignature(db(), scope, Number(personId), String(dataUrl));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Signature enregistrée : elle figure désormais sur les courriers." };
}

export async function deleteSignatureAction(form: FormData) {
  const scope = await requireScope();
  deleteSignature(db(), scope, Number(form.get("personId")));
  revalidatePath("/", "layout");
}
