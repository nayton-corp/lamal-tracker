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
import { readPdfText } from "@/infrastructure/pdf/read-text";
import { lookupPostalCode, type CommuneOption } from "@/infrastructure/regions/postal";
import { UserError } from "@/application/review";
import { chfField, rethrowForeignKey, toActionError, type ActionState } from "@/server/action";
import { db, today } from "@/server/context";
import { requireSession } from "@/server/auth";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return v === null ? undefined : String(v);
};
const opt = (f: FormData, k: string) => {
  const v = str(f, k)?.trim();
  return v ? v : null;
};

export async function saveHouseholdAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    saveHousehold(db(), {
      name: str(form, "name") ?? "",
      street: str(form, "street"),
      postalCode: str(form, "postalCode"),
      city: str(form, "city"),
      commune: str(form, "commune"),
      bfsNumber: opt(form, "bfsNumber") ? Number(form.get("bfsNumber")) : null,
      canton: (str(form, "canton") ?? "") as never,
      region: Number(str(form, "region")),
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  const next = String(form.get("next") ?? "");
  if (next.startsWith("/bienvenue")) redirect(next);
  return { ok: "Foyer enregistré." };
}

export async function savePersonAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  let id: number;
  try {
    const h = getHousehold(db());
    if (!h) throw new UserError("Enregistrez d'abord l'adresse.");
    // Les préférences du comparateur (frais, modèles, médecin, caisses exclues) viennent du
    // questionnaire des besoins : on les conserve telles quelles à la modification.
    const existing = opt(form, "id") ? listPersons(db(), h.id).find((p) => p.id === Number(form.get("id"))) : undefined;
    id = savePerson(db(), h.id, {
      id: existing?.id,
      firstName: str(form, "firstName") ?? "",
      lastName: str(form, "lastName") ?? "",
      birthDate: str(form, "birthDate") ?? "",
      kidSubgroup: str(form, "kidSubgroup") ?? "K1",
      employedAccidentCover: form.has("employedAccidentCover") ? form.get("employedAccidentCover") === "on" : (existing?.employedAccidentCover ?? false),
      healthCostsRp: existing?.healthCostsRp ?? 50000,
      allowedModels: (existing?.allowedModels ?? []) as never,
      excludedInsurerIds: existing?.excludedInsurerIds ?? [],
      doctorName: existing?.doctorName ?? null,
    });
    afterPersonSaved(h.id);
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
function afterPersonSaved(householdId: number) {
  const persons = listPersons(db(), householdId);
  const h = getHousehold(db())!;
  if (persons.length > 1 && getHouseholdMode(db()) !== "FAMILY") setHouseholdMode(db(), "FAMILY");
  if (!h.name.trim() && persons[0]) {
    const first = persons[0];
    saveHousehold(db(), { ...h, canton: h.canton as never, name: persons.length === 1 ? `${first.firstName} ${first.lastName}` : `Famille ${first.lastName}` });
  }
}

/** Accueil « pour moi seul » : identité et adresse en une seule fois. */
export async function saveSoloAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const firstName = str(form, "firstName") ?? "";
    const lastName = str(form, "lastName") ?? "";
    const h = getHousehold(db());
    const id = saveHousehold(db(), {
      name: `${firstName} ${lastName}`.trim(),
      street: str(form, "street"),
      postalCode: str(form, "postalCode"),
      city: str(form, "city"),
      commune: str(form, "commune"),
      bfsNumber: opt(form, "bfsNumber") ? Number(form.get("bfsNumber")) : null,
      canton: (str(form, "canton") ?? "") as never,
      region: Number(str(form, "region")),
    });
    const existing = h ? listPersons(db(), h.id)[0] : undefined;
    savePerson(db(), id, {
      id: existing?.id,
      firstName,
      lastName,
      birthDate: str(form, "birthDate") ?? "",
      kidSubgroup: existing?.kidSubgroup ?? "K1",
      employedAccidentCover: existing?.employedAccidentCover ?? false,
      healthCostsRp: existing?.healthCostsRp ?? 50000,
      allowedModels: (existing?.allowedModels ?? []) as never,
      excludedInsurerIds: existing?.excludedInsurerIds ?? [],
      doctorName: existing?.doctorName ?? null,
    });
    if (!getHouseholdMode(db())) setHouseholdMode(db(), "SOLO");
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  const next = String(form.get("next") ?? "");
  if (next.startsWith("/bienvenue")) redirect(next);
  return { ok: "Enregistré." };
}

export async function deletePersonAction(form: FormData) {
  await requireSession();
  try {
    deletePerson(db(), Number(form.get("id")));
  } catch (e) {
    rethrowForeignKey(e, "Cette personne participe à un rituel en cours : supprimez d'abord le rituel.");
  }
  revalidatePath("/", "layout");
  redirect("/foyer");
}

export async function savePolicyAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const billed = chfField(form.get("billedMonthly"));
    if (billed === null) throw new UserError("Indiquez la prime mensuelle facturée.");
    savePolicy(db(), {
      id: opt(form, "id") ? Number(form.get("id")) : undefined,
      personId: Number(form.get("personId")),
      coverageYear: Number(form.get("coverageYear")),
      insurerId: Number(form.get("insurerId")),
      policyNumber: opt(form, "policyNumber"),
      tariffCode: opt(form, "tariffCode"),
      tariffLabel: opt(form, "tariffLabel"),
      modelType: str(form, "modelType") ?? "STANDARD",
      franchiseChf: Number(form.get("franchiseChf")),
      accident: form.get("accident") === "on",
      billedMonthlyRp: billed,
    }, opt(form, "tariffCode") ? "OFSP" : "MANUAL");
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Contrat enregistré." };
}

export async function deletePolicyAction(form: FormData) {
  await requireSession();
  try {
    deletePolicy(db(), Number(form.get("id")));
  } catch (e) {
    rethrowForeignKey(e, "Ce contrat sert à un rituel en cours : supprimez d'abord le rituel.");
  }
  revalidatePath("/", "layout");
}

export async function saveLcaAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    saveLca(db(), {
      id: opt(form, "id") ? Number(form.get("id")) : undefined,
      personId: Number(form.get("personId")),
      insurerName: str(form, "insurerName") ?? "",
      linkedInsurerId: opt(form, "linkedInsurerId") ? Number(form.get("linkedInsurerId")) : null,
      guarantee: (str(form, "guarantee") ?? "") as never,
      productName: opt(form, "productName"),
      policyNumber: opt(form, "policyNumber"),
      monthlyRp: chfField(form.get("monthly")),
      minTermEnd: opt(form, "minTermEnd"),
      noticeMonths: opt(form, "noticeMonths") ? Number(form.get("noticeMonths")) : null,
      active: form.getAll("active").includes("on"),
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Complémentaire enregistrée." };
}

export async function deleteLcaAction(form: FormData) {
  await requireSession();
  try {
    deleteLca(db(), Number(form.get("id")));
  } catch (e) {
    rethrowForeignKey(e, "Cette complémentaire est encore référencée : supprimez d'abord ce qui s'y rapporte.");
  }
  revalidatePath("/", "layout");
}

export async function postalCodeAction(npa: string): Promise<CommuneOption[]> {
  await requireSession();
  return lookupPostalCode(npa);
}

export async function tariffOptionsAction(personId: number, year: number, insurerId: number): Promise<TariffOptions> {
  await requireSession();
  return tariffOptions(db(), personId, year, insurerId);
}

const MAX_PDF = 20 * 1024 * 1024;

/** Texte du PDF envoyé, ou un message d'erreur lisible. */
async function pdfText(form: FormData): Promise<{ text: string } | { error: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez le PDF de votre police." };
  if (file.size > MAX_PDF) return { error: "Fichier trop volumineux (20 Mo au plus)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return { error: "Ce fichier n'est pas un PDF." };
  try {
    return { text: await readPdfText(bytes) };
  } catch {
    return { error: "Ce fichier n'a pas pu être lu comme un PDF." };
  }
}

export async function analyzePolicyAction(form: FormData): Promise<{ result?: PolicyImport; error?: string }> {
  await requireSession();
  const read = await pdfText(form);
  if ("error" in read) return read;
  try {
    return { result: analyzePolicyText(db(), read.text, Number(today().slice(0, 4))) };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    return { error: "Lecture impossible." };
  }
}

/** Accueil depuis la police : personnes et adresse lues, avant tout foyer. Le texte est renvoyé pour l'étape suivante. */
export async function analyzePolicyStartAction(form: FormData): Promise<{ preview?: PolicyHolderPreview; text?: string; error?: string }> {
  await requireSession();
  const read = await pdfText(form);
  if ("error" in read) return read;
  try {
    return { preview: previewPolicyHolder(db(), read.text, Number(today().slice(0, 4))), text: read.text.slice(0, 200_000) };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    return { error: "Lecture impossible." };
  }
}

/** Crée le foyer confirmé, puis lit les contrats dans le même texte de police. */
export async function createFromPolicyAction(input: HouseholdFromPolicy, text: string): Promise<{ result?: PolicyImport; error?: string }> {
  await requireSession();
  try {
    createHouseholdFromPolicy(db(), input);
  } catch (e) {
    const state = toActionError(e);
    return { error: state?.error ?? "Enregistrement impossible." };
  }
  // Pas de revalidation ici : l'écran reste monté pour vérifier les contrats ; l'enregistrement final rafraîchit.
  try {
    return { result: analyzePolicyText(db(), String(text).slice(0, 200_000), Number(today().slice(0, 4))) };
  } catch (e) {
    return { error: e instanceof UserError ? e.message : "Lecture impossible." };
  }
}

export async function applyPolicyImportAction(input: ConfirmedImport): Promise<{ ok?: string; error?: string }> {
  try {
    const n = applyPolicyImport(db(), input);
    revalidatePath("/", "layout");
    return { ok: `${n} contrat(s) ${input.year} enregistré(s).` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Enregistrement impossible." };
  }
}
