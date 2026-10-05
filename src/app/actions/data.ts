"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { saveInsurer } from "@/application/household";
import { UserError } from "@/application/errors";
import { resetCo2, resetInsurerAddress, saveCo2 } from "@/application/reference-data";
import { refreshReference } from "@/server/reference";
import { saveSubscription, removeSubscription, notify, pushSubscriptionSchema } from "@/infrastructure/push/push";
import { chfField, toActionError, type ActionState } from "@/server/action";
import { currentYear, db, nowIso } from "@/server/context";
import { dataDir, importJob, startArchivesImport, startImport, startYearImport } from "@/server/jobs";
import { checkForNewPremiums } from "@/server/watch";
import { requireAdminScope, requireScope } from "@/server/auth";
import { FIRST_PREMIUM_YEAR } from "@/domain/lamal";

export async function checkPremiumsAction(): Promise<ActionState> {
  await requireAdminScope();
  try {
    return { ok: await checkForNewPremiums(true) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Importe les primes officielles d'une année précise (fichier courant ou archive), pour pré-remplir
 * un contrat. Ouvert à tout compte : ce sont des données publiques, un seul import tourne à la fois.
 */
export async function importYearAction(year: number): Promise<ActionState> {
  await requireScope();
  const current = currentYear();
  if (!Number.isInteger(year) || year < FIRST_PREMIUM_YEAR || year > current + 1) return { error: "Année invalide." };
  return startYearImport(year) ? { ok: `Import des primes ${year} lancé.` } : { error: "Un import est déjà en cours." };
}

export async function importArchivesAction(): Promise<ActionState> {
  await requireAdminScope();
  return startArchivesImport() ? { ok: "Import des archives lancé." } : { error: "Un import est déjà en cours." };
}

/** Un fichier de primes OFSP complet pèse quelques dizaines de Mo ; au-delà, ce n'est pas lui. */
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export async function uploadPremiumsAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdminScope();
  try {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choisissez un fichier .xlsx ou .csv.");
    if (!/\.(xlsx|csv|zip)$/i.test(file.name)) throw new UserError("Format attendu : .xlsx, .csv ou archive .zip de l'OFSP.");
    if (file.size > MAX_UPLOAD_BYTES) throw new UserError("Fichier trop volumineux (60 Mo au maximum).");
    if (importJob().running) throw new UserError("Un import est déjà en cours.");
    const dir = path.join(dataDir(), "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`);
    fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
    // Le fichier est supprimé par la tâche d'import une fois traité (son empreinte reste en base).
    if (!startImport({ kind: "file", file: target, name: file.name })) {
      fs.rmSync(target, { force: true });
      throw new UserError("Un import est déjà en cours.");
    }
    return { ok: "Import lancé." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveCo2Action(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireAdminScope();
  try {
    saveCo2(db(), scope, Number(form.get("year")), chfField(form.get("co2Annual")));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Montant enregistré." };
}

/** Abandonne la saisie : le montant officiel (OFEV) reprend la main et suivra ses mises à jour. */
export async function resetCo2Action(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireAdminScope();
  resetCo2(db(), scope, Number(form.get("year")));
  revalidatePath("/", "layout");
  return { ok: "Montant officiel rétabli." };
}

export async function resetInsurerAddressAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireAdminScope();
  resetInsurerAddress(db(), scope, Number(form.get("id")));
  revalidatePath("/", "layout");
  return { ok: "Adresse officielle rétablie." };
}

export async function refreshReferenceAction(): Promise<ActionState> {
  await requireAdminScope();
  try {
    const check = await refreshReference();
    return check.ok ? { ok: check.results.join(" ") } : { error: check.results.join(" ") };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveInsurerAction(_: ActionState, form: FormData): Promise<ActionState> {
  const scope = await requireAdminScope();
  try {
    saveInsurer(
      db(),
      scope,
      {
        id: Number(form.get("id")),
        displayName: String(form.get("displayName") ?? "") || null,
        terminationAddress: String(form.get("terminationAddress") ?? "") || null,
        website: String(form.get("website") ?? "") || null,
      },
      nowIso(),
    );
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Caisse enregistrée." };
}

export async function subscribePushAction(sub: unknown) {
  const scope = await requireScope();
  // Données fournies par le navigateur : schéma strict et hôte de push reconnu (sinon SSRF possible).
  const parsed = pushSubscriptionSchema.safeParse(sub);
  if (!parsed.success) throw new UserError("Abonnement aux notifications invalide.");
  try {
    saveSubscription(db(), scope.userId, parsed.data);
  } catch (e) {
    console.error("[notifications] abonnement :", e instanceof Error ? e.message : e);
    throw new UserError("Abonnement aux notifications impossible : réessayez.");
  }
  revalidatePath("/donnees");
}

export async function unsubscribePushAction(endpoint: string) {
  const scope = await requireScope();
  if (typeof endpoint !== "string" || endpoint.length > 2000) return;
  removeSubscription(db(), scope.userId, endpoint);
  revalidatePath("/donnees");
}

export async function testPushAction(): Promise<ActionState> {
  const scope = await requireScope();
  const n = await notify(db(), { userId: scope.userId }, { title: "Primes LAMal", body: "Les notifications fonctionnent.", url: "/" });
  return n > 0 ? { ok: `Notification envoyée à ${n} appareil(s).` } : { error: "Aucun appareil abonné." };
}
