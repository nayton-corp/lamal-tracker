"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteLca,
  deletePerson,
  deletePolicy,
  getHouseholdMode,
  listPersons,
  saveHousehold,
  saveLca,
  savePerson,
  savePolicy,
  setHouseholdMode,
  getHousehold,
} from "@/application/household";
import { tariffOptions, type TariffOptions } from "@/application/tariffs";
import { analyzePolicyText, applyPolicyImport, createHouseholdFromPolicy, previewPolicyHolder, type ConfirmedImport, type HouseholdFromPolicy, type PolicyHolderPreview, type PolicyImport } from "@/application/policy-import";
import { MAX_PDF_PAGES, readPdfText } from "@/infrastructure/pdf/read-text";
import { MAX_POLICY_TEXT } from "@/domain/policy-import";
import { rateLimit } from "@/server/accounts";
import { lookupPostalCode, type CommuneOption } from "@/infrastructure/regions/postal";
import { UserError } from "@/application/errors";
import { DEFAULT_HEALTH_COSTS_RP, DEFAULT_KID_SUBGROUP } from "@/domain/lamal";
import { chfField, rethrowForeignKey, toActionError, type ActionState } from "@/server/action";
import { currentYear, db } from "@/server/context";
import { requireScope } from "@/server/auth";
import { chosenMode } from "@/server/onboarding";
import { withHousehold, type Scope } from "@/application/scope";
import { saveHouseholdAddress } from "@/application/domicile";

const formText = (f: FormData, k: string) => {
  const v = f.get(k);
  return v === null ? undefined : String(v);
};
const formTextOrNull = (f: FormData, k: string) => {
  const v = formText(f, k)?.trim();
  return v ? v : null;
};

export async function saveHouseholdAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const id = saveHouseholdAddress(db(), scope, {
      name: formText(form, "name") ?? "",
      street: formText(form, "street"),
      postalCode: formText(form, "postalCode"),
      city: formText(form, "city"),
      commune: formText(form, "commune"),
      bfsNumber: formTextOrNull(form, "bfsNumber") ? Number(form.get("bfsNumber")) : null,
      canton: (formText(form, "canton") ?? "") as never,
      region: Number(formText(form, "region")),
    }, form.get("addressChange") === "CORRECTION" ? "CORRECTION" : "MOVE");
    const mine = withHousehold(scope, id);
    if (!getHouseholdMode(db(), mine)) setHouseholdMode(db(), mine, (await chosenMode(scope)) ?? "FAMILY");
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  const next = String(form.get("next") ?? "");
  if (next.startsWith("/bienvenue")) redirect(next);
  return { ok: "Foyer enregistré." };
}

export async function savePersonAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  let id: number;
  try {
    const householdRow = getHousehold(db(), scope);
    if (!householdRow) throw new UserError("Enregistrez d'abord l'adresse.");
    // Les préférences du comparateur (frais, modèles, médecin, caisses exclues) viennent du
    // questionnaire des besoins : on les conserve telles quelles à la modification.
    const existing = formTextOrNull(form, "id") ? listPersons(db(), householdRow.id).find((p) => p.id === Number(form.get("id"))) : undefined;
    id = savePerson(db(), scope, {
      id: existing?.id,
      firstName: formText(form, "firstName") ?? "",
      lastName: formText(form, "lastName") ?? "",
      birthDate: formText(form, "birthDate") ?? "",
      kidSubgroup: formText(form, "kidSubgroup") ?? DEFAULT_KID_SUBGROUP,
      employedAccidentCover: form.has("employedAccidentCover") ? form.get("employedAccidentCover") === "on" : (existing?.employedAccidentCover ?? false),
      healthCostsRp: existing?.healthCostsRp ?? DEFAULT_HEALTH_COSTS_RP,
      allowedModels: (existing?.allowedModels ?? []) as never,
      excludedInsurerIds: existing?.excludedInsurerIds ?? [],
      doctorName: existing?.doctorName ?? null,
    });
    afterPersonSaved(scope);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  const next = String(form.get("next") ?? "");
  if (next.startsWith("/bienvenue")) redirect(next);
  if (!form.get("id") && !form.get("stay")) redirect(`/foyer/personne/${id}`);
  return { ok: "Personne enregistrée." };
}

/** Une 2e personne fait passer en mode foyer ; le nom du foyer se déduit de la première personne. */
function afterPersonSaved(scope: Scope) {
  const householdRow = getHousehold(db(), scope)!;
  const persons = listPersons(db(), householdRow.id);
  if (persons.length > 1 && getHouseholdMode(db(), scope) !== "FAMILY") setHouseholdMode(db(), scope, "FAMILY");
  if (!householdRow.name.trim() && persons[0]) {
    const first = persons[0];
    saveHousehold(db(), scope, { ...householdRow, canton: householdRow.canton as never, name: persons.length === 1 ? `${first.firstName} ${first.lastName}` : `Famille ${first.lastName}` });
  }
}

/** Accueil « pour moi seul » : identité et adresse en une seule fois. */
export async function saveSoloAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const firstName = formText(form, "firstName") ?? "";
    const lastName = formText(form, "lastName") ?? "";
    const householdRow = getHousehold(db(), scope);
    const id = saveHouseholdAddress(db(), scope, {
      name: `${firstName} ${lastName}`.trim(),
      street: formText(form, "street"),
      postalCode: formText(form, "postalCode"),
      city: formText(form, "city"),
      commune: formText(form, "commune"),
      bfsNumber: formTextOrNull(form, "bfsNumber") ? Number(form.get("bfsNumber")) : null,
      canton: (formText(form, "canton") ?? "") as never,
      region: Number(formText(form, "region")),
    }, form.get("addressChange") === "CORRECTION" ? "CORRECTION" : "MOVE");
    const existing = householdRow ? listPersons(db(), householdRow.id)[0] : undefined;
    const mine = withHousehold(scope, id);
    savePerson(db(), mine, {
      id: existing?.id,
      firstName,
      lastName,
      birthDate: formText(form, "birthDate") ?? "",
      kidSubgroup: existing?.kidSubgroup ?? DEFAULT_KID_SUBGROUP,
      employedAccidentCover: existing?.employedAccidentCover ?? false,
      healthCostsRp: existing?.healthCostsRp ?? DEFAULT_HEALTH_COSTS_RP,
      allowedModels: (existing?.allowedModels ?? []) as never,
      excludedInsurerIds: existing?.excludedInsurerIds ?? [],
      doctorName: existing?.doctorName ?? null,
    });
    if (!getHouseholdMode(db(), mine)) setHouseholdMode(db(), mine, "SOLO");
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  const next = String(form.get("next") ?? "");
  if (next.startsWith("/bienvenue")) redirect(next);
  return { ok: "Enregistré." };
}

export async function deletePersonAction(form: FormData) {
  const scope = await requireScope();
  try {
    deletePerson(db(), scope, Number(form.get("id")));
  } catch (e) {
    rethrowForeignKey(e, "Cette personne participe à un bilan en cours : supprimez d'abord le bilan.");
  }
  revalidatePath("/", "layout");
  redirect("/foyer");
}

/** Domicile choisi dans le formulaire (sélecteur de commune) ; vide si aucun canton n'est indiqué. */
function domicileFromForm(form: FormData) {
  const canton = formText(form, "canton");
  if (!canton) return {};
  return {
    commune: formText(form, "commune") ?? "",
    bfsNumber: formTextOrNull(form, "bfsNumber") ? Number(form.get("bfsNumber")) : null,
    canton: canton as never,
    region: Number(form.get("region")),
  };
}

export async function savePolicyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    const billed = chfField(form.get("billedMonthly"));
    if (billed === null) throw new UserError("Indiquez la prime mensuelle facturée.");
    savePolicy(db(), scope, {
      id: formTextOrNull(form, "id") ? Number(form.get("id")) : undefined,
      personId: Number(form.get("personId")),
      coverageYear: Number(form.get("coverageYear")),
      insurerId: Number(form.get("insurerId")),
      policyNumber: formTextOrNull(form, "policyNumber"),
      tariffCode: formTextOrNull(form, "tariffCode"),
      tariffLabel: formTextOrNull(form, "tariffLabel"),
      modelType: formText(form, "modelType") ?? "STANDARD",
      franchiseChf: Number(form.get("franchiseChf")),
      accident: form.get("accident") === "on",
      billedMonthlyRp: billed,
      ...domicileFromForm(form),
    }, formTextOrNull(form, "tariffCode") ? "OFSP" : "MANUAL");
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Contrat enregistré." };
}

export async function deletePolicyAction(form: FormData) {
  const scope = await requireScope();
  try {
    deletePolicy(db(), scope, Number(form.get("id")));
  } catch (e) {
    rethrowForeignKey(e, "Ce contrat sert à un bilan en cours : supprimez d'abord le bilan.");
  }
  revalidatePath("/", "layout");
}

export async function saveLcaAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireScope();
  try {
    saveLca(db(), scope, {
      id: formTextOrNull(form, "id") ? Number(form.get("id")) : undefined,
      personId: Number(form.get("personId")),
      insurerName: formText(form, "insurerName") ?? "",
      linkedInsurerId: formTextOrNull(form, "linkedInsurerId") ? Number(form.get("linkedInsurerId")) : null,
      guarantee: (formText(form, "guarantee") ?? "") as never,
      productName: formTextOrNull(form, "productName"),
      policyNumber: formTextOrNull(form, "policyNumber"),
      monthlyRp: chfField(form.get("monthly")),
      minTermEnd: formTextOrNull(form, "minTermEnd"),
      noticeMonths: formTextOrNull(form, "noticeMonths") ? Number(form.get("noticeMonths")) : null,
      active: form.getAll("active").includes("on"),
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Complémentaire enregistrée." };
}

export async function deleteLcaAction(form: FormData) {
  const scope = await requireScope();
  try {
    deleteLca(db(), scope, Number(form.get("id")));
  } catch (e) {
    rethrowForeignKey(e, "Cette complémentaire est encore référencée : supprimez d'abord ce qui s'y rapporte.");
  }
  revalidatePath("/", "layout");
}

export async function postalCodeAction(npa: string): Promise<CommuneOption[]> {
  await requireScope();
  return lookupPostalCode(npa);
}

export async function tariffOptionsAction(personId: number, year: number, insurerId: number, where?: { canton: string; region: number }): Promise<TariffOptions> {
  const scope = await requireScope();
  const place = where?.canton ? { canton: String(where.canton), region: Number(where.region) } : undefined;
  return tariffOptions(db(), scope, Number(personId), Number(year), Number(insurerId), place);
}

const MAX_PDF = 20 * 1024 * 1024;

/** Texte du PDF envoyé, ou un message d'erreur lisible. */
async function pdfText(form: FormData, scope: Scope): Promise<{ text: string } | { error: string }> {
  try {
    rateLimit([`pdf:${scope.userId}`], 10, 60);
  } catch (e) {
    return { error: toActionError(e)?.error ?? "Trop de demandes." };
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez le PDF de votre police." };
  if (file.size > MAX_PDF) return { error: "Fichier trop volumineux (20 Mo au plus)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return { error: "Ce fichier n'est pas un PDF." };
  try {
    return { text: (await readPdfText(bytes)).slice(0, MAX_POLICY_TEXT) };
  } catch {
    return { error: `Ce fichier n'a pas pu être lu comme une police (PDF de ${MAX_PDF_PAGES} pages au plus).` };
  }
}

export async function analyzePolicyAction(form: FormData): Promise<{ result?: PolicyImport; error?: string }> {
  const scope = await requireScope();
  const read = await pdfText(form, scope);
  if ("error" in read) return read;
  try {
    return { result: analyzePolicyText(db(), scope, read.text, currentYear()) };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    return { error: "Lecture impossible." };
  }
}

/** Accueil depuis la police : personnes et adresse lues, avant tout foyer. Le texte est renvoyé pour l'étape suivante. */
export async function analyzePolicyStartAction(form: FormData): Promise<{ preview?: PolicyHolderPreview; text?: string; error?: string }> {
  const scope = await requireScope();
  const read = await pdfText(form, scope);
  if ("error" in read) return read;
  try {
    return { preview: previewPolicyHolder(db(), read.text, currentYear()), text: read.text };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    return { error: "Lecture impossible." };
  }
}

/** Crée le foyer confirmé, puis lit les contrats dans le même texte de police. */
export async function createFromPolicyAction(input: HouseholdFromPolicy, text: string): Promise<{ result?: PolicyImport; error?: string }> {
  const scope = await requireScope();
  let mine: Scope;
  try {
    mine = withHousehold(scope, createHouseholdFromPolicy(db(), scope, input));
  } catch (e) {
    const state = toActionError(e);
    return { error: state?.error ?? "Enregistrement impossible." };
  }
  // Pas de revalidation ici : l'écran reste monté pour vérifier les contrats ; l'enregistrement final rafraîchit.
  try {
    return { result: analyzePolicyText(db(), mine, String(text).slice(0, MAX_POLICY_TEXT), currentYear()) };
  } catch (e) {
    return { error: e instanceof UserError ? e.message : "Lecture impossible." };
  }
}

export async function applyPolicyImportAction(input: ConfirmedImport): Promise<{ ok?: string; error?: string }> {
  const scope = await requireScope();
  try {
    const n = applyPolicyImport(db(), scope, input);
    revalidatePath("/", "layout");
    return { ok: `${n} contrat(s) ${input.year} enregistré(s).` };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error("[import du contrat]", e);
    return { error: "Enregistrement impossible : réessayez, ou saisissez les contrats à la main." };
  }
}
