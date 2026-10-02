"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { saveInsurer } from "@/application/household";
import { UserError } from "@/application/review";
import { lamalParameters } from "@/infrastructure/db/schema";
import { saveSubscription, removeSubscription, notifyAll } from "@/infrastructure/push/push";
import { chfField, toActionError, type ActionState } from "@/server/action";
import { db, nowIso } from "@/server/context";
import { dataDir, startArchivesImport, startImport } from "@/server/jobs";
import { checkForNewPremiums } from "@/server/watch";

export async function checkPremiumsAction(): Promise<ActionState> {
  try {
    return { ok: await checkForNewPremiums(true) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function importArchivesAction(): Promise<ActionState> {
  return startArchivesImport() ? { ok: "Import des archives lancé." } : { error: "Un import est déjà en cours." };
}

export async function uploadPremiumsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new UserError("Choisissez un fichier .xlsx ou .csv.");
    if (!/\.(xlsx|csv|zip)$/i.test(file.name)) throw new UserError("Format attendu : .xlsx, .csv ou archive .zip de l'OFSP.");
    const dir = path.join(dataDir(), "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`);
    fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
    if (!startImport({ kind: "file", file: target, name: file.name })) throw new UserError("Un import est déjà en cours.");
    return { ok: "Import lancé." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveCo2Action(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const year = Number(form.get("year"));
    const amount = chfField(form.get("co2Annual"));
    db().update(lamalParameters).set({ co2AnnualRp: amount, sourceNote: "Saisi manuellement" }).where(eq(lamalParameters.year, year)).run();
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  return { ok: "Montant enregistré." };
}

export async function saveInsurerAction(_: ActionState, form: FormData): Promise<ActionState> {
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

export async function subscribePushAction(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  saveSubscription(db(), sub);
  revalidatePath("/donnees");
}

export async function unsubscribePushAction(endpoint: string) {
  removeSubscription(db(), endpoint);
  revalidatePath("/donnees");
}

export async function testPushAction(): Promise<ActionState> {
  const n = await notifyAll(db(), { title: "Primes LAMal", body: "Les notifications fonctionnent.", url: "/" });
  return n > 0 ? { ok: `Notification envoyée à ${n} appareil(s).` } : { error: "Aucun appareil abonné." };
}
