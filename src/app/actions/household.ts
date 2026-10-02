"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteLca,
  deletePerson,
  deletePolicy,
  saveHousehold,
  saveLca,
  savePerson,
  savePolicy,
  getHousehold,
} from "@/application/household";
import { tariffOptions, type TariffOptions } from "@/application/tariffs";
import { analyzePolicyText, applyPolicyImport, type ConfirmedImport, type PolicyImport } from "@/application/policy-import";
import { readPdfText } from "@/infrastructure/pdf/read-text";
import { lookupPostalCode, type CommuneOption } from "@/infrastructure/regions/postal";
import { UserError } from "@/application/review";
import { chfField, toActionError, type ActionState } from "@/server/action";
import { db, today } from "@/server/context";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return v === null ? undefined : String(v);
};
const opt = (f: FormData, k: string) => {
  const v = str(f, k)?.trim();
  return v ? v : null;
};

export async function saveHouseholdAction(_: ActionState, form: FormData): Promise<ActionState> {
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
  return { ok: "Foyer enregistré." };
}

export async function savePersonAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id: number;
  try {
    const h = getHousehold(db());
    if (!h) throw new UserError("Enregistrez d'abord le foyer.");
    const healthCosts = chfField(form.get("healthCosts"));
    id = savePerson(db(), h.id, {
      id: opt(form, "id") ? Number(form.get("id")) : undefined,
      firstName: str(form, "firstName") ?? "",
      lastName: str(form, "lastName") ?? "",
      birthDate: str(form, "birthDate") ?? "",
      kidSubgroup: str(form, "kidSubgroup") ?? "K1",
      employedAccidentCover: form.get("employedAccidentCover") === "on",
      healthCostsRp: healthCosts ?? 50000,
      allowedModels: form.getAll("allowedModels").map(String) as never,
      excludedInsurerIds: form.getAll("excludedInsurerIds").map(Number),
      doctorName: opt(form, "doctorName"),
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  const next = String(form.get("next") ?? "");
  if (next.startsWith("/bienvenue")) redirect(next);
  if (!form.get("id") && !form.get("stay")) redirect(`/foyer/personne/${id}`);
  return { ok: "Personne enregistrée." };
}

export async function deletePersonAction(form: FormData) {
  deletePerson(db(), Number(form.get("id")));
  revalidatePath("/", "layout");
  redirect("/foyer");
}

export async function savePolicyAction(_: ActionState, form: FormData): Promise<ActionState> {
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
  deletePolicy(db(), Number(form.get("id")));
  revalidatePath("/", "layout");
}

export async function saveLcaAction(_: ActionState, form: FormData): Promise<ActionState> {
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
  deleteLca(db(), Number(form.get("id")));
  revalidatePath("/", "layout");
}

export async function postalCodeAction(npa: string): Promise<CommuneOption[]> {
  return lookupPostalCode(npa);
}

export async function tariffOptionsAction(personId: number, year: number, insurerId: number): Promise<TariffOptions> {
  return tariffOptions(db(), personId, year, insurerId);
}

export async function analyzePolicyAction(form: FormData): Promise<{ result?: PolicyImport; error?: string }> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez le PDF de votre police." };
  if (file.size > 20 * 1024 * 1024) return { error: "Fichier trop volumineux (20 Mo au plus)." };
  try {
    const text = await readPdfText(new Uint8Array(await file.arrayBuffer()));
    return { result: analyzePolicyText(db(), text, Number(today().slice(0, 4))) };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    return { error: "Ce fichier n'a pas pu être lu comme un PDF." };
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
