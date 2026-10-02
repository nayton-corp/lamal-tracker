"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { saveInsurer } from "@/application/household";
import { UserError } from "@/application/review";
import { insurer, lamalParameters } from "@/infrastructure/db/schema";
import { officialCo2 } from "@/infrastructure/reference/apply";
import { refreshReference } from "@/server/reference";
import { saveSubscription, removeSubscription, notifyAll, pushSubscriptionSchema } from "@/infrastructure/push/push";
import { chfField, toActionError, type ActionState } from "@/server/action";
import { db, nowIso } from "@/server/context";
import { dataDir, importJob, startArchivesImport, startImport, startYearImport } from "@/server/jobs";
import { checkForNewPremiums } from "@/server/watch";
import { requireSession } from "@/server/auth";

export async function checkPremiumsAction(): Promise<ActionState> {
  await requireSession();
  try {
    return { ok: await checkForNewPremiums(true) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Importe les primes d'une année précise (fichier courant ou archive). */
export async function importYearAction(year: number): Promise<ActionState> {
  await requireSession();
  return startYearImport(year) ? { ok: `Import des primes ${year} lancé.` } : { error: "Un import est déjà en cours." };
}

export async function importArchivesAction(): Promise<ActionState> {
  await requireSession();
  return startArchivesImport() ? { ok: "Import des archives lancé." } : { error: "Un import est déjà en cours." };
}

/** Un fichier de primes OFSP complet pèse quelques dizaines de Mo ; au-delà, ce n'est pas lui. */
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export async function uploadPremiumsAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
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
  await requireSession();
  try {
    const year = Number(form.get("year"));
    const amount = chfField(form.get("co2Annual"));
    db().update(lamalParameters).set({ co2AnnualRp: amount, co2Source: "USER", sourceNote: "Saisi manuellement" }).where(eq(lamalParameters.year, year)).run();
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Montant enregistré." };
}

/** Abandonne la saisie : le montant officiel (OFEV) reprend la main et suivra ses mises à jour. */
export async function resetCo2Action(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  const year = Number(form.get("year"));
  db()
    .update(lamalParameters)
    .set({ co2AnnualRp: officialCo2(year), co2Source: "OFFICIAL", sourceNote: "Office fédéral de l'environnement (OFEV)" })
    .where(eq(lamalParameters.year, year))
    .run();
  revalidatePath("/", "layout");
  return { ok: "Montant officiel rétabli." };
}

export async function resetInsurerAddressAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  db().update(insurer).set({ terminationAddress: null, addressVerifiedAt: null }).where(eq(insurer.id, Number(form.get("id")))).run();
  revalidatePath("/", "layout");
  return { ok: "Adresse officielle rétablie." };
}

export async function refreshReferenceAction(): Promise<ActionState> {
  await requireSession();
  try {
    const check = await refreshReference();
    return check.ok ? { ok: check.results.join(" ") } : { error: check.results.join(" ") };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveInsurerAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireSession();
  try {
    saveInsurer(
      db(),
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
  await requireSession();
  // Données fournies par le navigateur : schéma strict et hôte de push reconnu (sinon SSRF possible).
  const parsed = pushSubscriptionSchema.safeParse(sub);
  if (!parsed.success) throw new UserError("Abonnement aux notifications invalide.");
  try {
    saveSubscription(db(), parsed.data);
  } catch (e) {
    throw new UserError(e instanceof Error ? e.message : String(e));
  }
  revalidatePath("/donnees");
}

export async function unsubscribePushAction(endpoint: string) {
  await requireSession();
  if (typeof endpoint !== "string" || endpoint.length > 2000) return;
  removeSubscription(db(), endpoint);
  revalidatePath("/donnees");
}

export async function testPushAction(): Promise<ActionState> {
  await requireSession();
  const n = await notifyAll(db(), { title: "Primes LAMal", body: "Les notifications fonctionnent.", url: "/" });
  return n > 0 ? { ok: `Notification envoyée à ${n} appareil(s).` } : { error: "Aucun appareil abonné." };
}
