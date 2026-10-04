import "server-only";
import { eq } from "drizzle-orm";
import { syncPingenLetters, type PingenDeps } from "@/application/pingen";
import { insurerLabel } from "@/infrastructure/db/queries";
import { insurer, letter, review } from "@/infrastructure/db/schema";
import { createPingenClient, pingenConfig, type PingenClient } from "@/infrastructure/pingen/client";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";
import { householdKey, notify } from "@/infrastructure/push/push";
import { db, nowIso } from "./context";

const globalForPingen = globalThis as unknown as { __pingen?: { key: string; client: PingenClient } };

/** Client Pingen si l'envoi est configuré (variables PINGEN_*), sinon null : l'option est masquée. */
export function pingenClient(): PingenClient | null {
  const config = pingenConfig();
  if (!config) return null;
  const key = JSON.stringify(config);
  if (globalForPingen.__pingen?.key !== key) globalForPingen.__pingen = { key, client: createPingenClient(config) };
  return globalForPingen.__pingen.client;
}

export function pingenDeps(client: PingenClient): PingenDeps {
  return { client, render: (content, signed) => renderLetterPdf(content, signed, "pingen") };
}

/** Passe du planificateur : suit les lettres confiées à Pingen et prévient d'un refus. */
export async function pingenTick(): Promise<void> {
  const client = pingenClient();
  if (!client) return;
  const result = await syncPingenLetters(db(), client, nowIso());
  for (const id of result.newlyFailed) {
    const row = db()
      .select({ insurer, year: review.targetYear, householdId: review.householdId })
      .from(letter)
      .innerJoin(insurer, eq(insurer.id, letter.insurerId))
      .innerJoin(review, eq(review.id, letter.reviewId))
      .where(eq(letter.id, id))
      .get();
    if (!row) continue;
    await notify(
      db(),
      { householdId: row.householdId },
      { title: "Lettre non envoyée par Pingen", body: `Le courrier à ${insurerLabel(row.insurer)} doit être repris : ouvrez les démarches.`, url: `/rituel/${row.year}/lettres` },
      householdKey(row.householdId, `pingen-echec-${id}`),
    );
  }
  if (result.errors.length) console.error("[pingen]", result.errors.join(" ; "));
}
