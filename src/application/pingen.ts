import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { IsoDate } from "@/domain/dates";
import type { LetterContent } from "@/domain/letter";
import { PINGEN_UNKNOWN, pingenBlockers, pingenNeedsSync, pingenPhase } from "@/domain/pingen";
import type { Db } from "@/infrastructure/db/client";
import { letter } from "@/infrastructure/db/schema";
import { PingenError, PingenNoAnswerError, type PingenClient, type PingenLetter } from "@/infrastructure/pingen/client";
import { getLetter } from "./letters";
import { UserError } from "./errors";
import { ownedLetter, type Scope } from "./scope";
import { signaturesByName } from "./signatures";

export interface PingenDeps {
  client: PingenClient;
  /** Rendu PDF de la lettre, mise en page Pingen, signatures dessinées apposées. */
  render: (content: LetterContent, signed: Record<string, string>) => Promise<Uint8Array>;
}

/** Nom de fichier unique transmis à Pingen : il permet de retrouver une création restée sans réponse. */
export function pingenFileName(row: { id: number; generatedAt: string }): string {
  return `lamal-lettre-${row.id}-${row.generatedAt.replace(/\D/g, "").slice(0, 14)}.pdf`;
}

/** Conditions avant de proposer l'envoi par Pingen (signatures, adresse). */
export function pingenReadiness(db: Db, scope: Scope, content: LetterContent): string[] {
  return pingenBlockers(content, Object.keys(signaturesByName(db, scope)));
}

function applyPingen(db: Db, letterId: number, found: PingenLetter, nowIso: string) {
  db.update(letter)
    .set({
      pingenLetterId: found.id,
      pingenStatus: found.status,
      pingenCheckedAt: nowIso,
      ...(found.trackingNumber ? { trackingNumber: found.trackingNumber } : {}),
      ...(found.priceRp !== null ? { pingenPriceRp: found.priceRp } : {}),
    })
    .where(eq(letter.id, letterId))
    .run();
}

/**
 * Confie la lettre à Pingen (impression, recommandé). La lettre est réservée avant l'appel :
 * deux demandes simultanées ne peuvent pas l'envoyer deux fois. Si Pingen refuse, elle redevient
 * « à envoyer » ; si Pingen ne répond pas, elle reste « non confirmée » jusqu'à vérification.
 */
export async function sendLetterViaPingen(db: Db, scope: Scope, letterId: number, today: IsoDate, nowIso: string, deps: PingenDeps): Promise<PingenLetter> {
  const row = getLetter(db, scope, letterId);
  if (!row) throw new UserError("Lettre introuvable.");
  if (row.sentAt || row.pingenStatus) throw new UserError("Cette lettre est déjà envoyée.");
  const blockers = pingenReadiness(db, scope, row.content);
  if (blockers.length) throw new UserError(blockers.join("\n"));
  const pdf = await deps.render(row.content, signaturesByName(db, scope));

  const claimed = db
    .update(letter)
    .set({ sentAt: today, pingenStatus: PINGEN_UNKNOWN, pingenCheckedAt: nowIso })
    .where(and(eq(letter.id, letterId), isNull(letter.sentAt), isNull(letter.pingenStatus)))
    .run();
  if (claimed.changes !== 1) throw new UserError("Cette lettre est déjà envoyée.");

  try {
    const created = await deps.client.sendRegistered(pdf, pingenFileName(row));
    applyPingen(db, letterId, created, nowIso);
    return created;
  } catch (error) {
    if (error instanceof PingenNoAnswerError) {
      throw new UserError(`${error.message} L'app vérifie auprès de Pingen ; ne la renvoyez pas avant d'en savoir plus.`);
    }
    db.update(letter).set({ sentAt: null, pingenStatus: null, pingenCheckedAt: null }).where(eq(letter.id, letterId)).run();
    if (error instanceof PingenError) throw new UserError(error.message);
    throw error;
  }
}

export interface PingenSyncResult {
  checked: number;
  /** Lettres que Pingen vient de refuser ou n'a pas pu distribuer. */
  newlyFailed: number[];
  errors: string[];
}

/**
 * Met à jour le statut, le n° de suivi et le prix des lettres confiées à Pingen (tous foyers : tâche de
 * fond). Pour une seule lettre demandée par un utilisateur, l'appelant vérifie d'abord qu'elle est à lui.
 */
export async function syncPingenLetters(db: Db, client: PingenClient, nowIso: string, onlyLetterId?: number): Promise<PingenSyncResult> {
  const rows = db
    .select()
    .from(letter)
    .where(onlyLetterId === undefined ? isNotNull(letter.pingenStatus) : and(isNotNull(letter.pingenStatus), eq(letter.id, onlyLetterId)))
    .all()
    .filter((r) => pingenNeedsSync(r.pingenStatus));
  const result: PingenSyncResult = { checked: 0, newlyFailed: [], errors: [] };
  for (const r of rows) {
    try {
      const found = r.pingenLetterId ? await client.getLetter(r.pingenLetterId) : await client.findByFileName(pingenFileName(r));
      result.checked++;
      if (!found) {
        db.update(letter).set({ pingenCheckedAt: nowIso }).where(eq(letter.id, r.id)).run();
        continue;
      }
      applyPingen(db, r.id, found, nowIso);
      if (pingenPhase(found.status) === "FAILED") result.newlyFailed.push(r.id);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}

/**
 * Renonce à l'envoi par Pingen d'une lettre refusée ou non confirmée : elle redevient « à envoyer »
 * (impression et recommandé par soi-même, ou nouvel essai).
 */
export function abandonPingen(db: Db, scope: Scope, letterId: number) {
  const row = ownedLetter(db, scope, letterId);
  if (!row.pingenStatus) throw new UserError("Cette lettre n'a pas été confiée à Pingen.");
  const phase = pingenPhase(row.pingenStatus);
  if (phase !== "FAILED" && phase !== "UNCONFIRMED") throw new UserError("Pingen traite cette lettre : elle ne peut plus être reprise.");
  db.update(letter)
    .set({ sentAt: null, trackingNumber: null, pingenLetterId: null, pingenStatus: null, pingenPriceRp: null, pingenCheckedAt: null })
    .where(eq(letter.id, letterId))
    .run();
}
