import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { authToken } from "@/infrastructure/db/schema";

/*
 * Jetons à usage unique (liens envoyés par courriel, étapes de connexion). Le jeton n'existe en
 * clair que dans le lien ou le cookie ; la base n'en garde que l'empreinte SHA-256.
 */

export type TokenKind = (typeof authToken.$inferSelect)["kind"];

/** Empreinte SHA-256 (base64url) sous laquelle un jeton ou un code est rangé en base. */
export const digest = (value: string) => createHash("sha256").update(value).digest("base64url");
/** Valeur aléatoire sûre pour une URL ou un cookie (32 octets par défaut). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/**
 * Crée un jeton valable `ttlMs` et renvoie sa valeur en clair, la seule fois où elle existe.
 * `data` : contexte attaché au jeton (défi WebAuthn, secret TOTP provisoire chiffré…).
 */
export function issueToken(
  db: Db,
  input: { userId: number | null; kind: TokenKind; ttlMs: number; data?: Record<string, unknown> },
  nowIso: string,
): string {
  purgeExpiredTokens(db, nowIso);
  const token = randomToken();
  db.insert(authToken)
    .values({
      userId: input.userId,
      kind: input.kind,
      tokenHash: digest(token),
      data: input.data ?? null,
      expiresAt: new Date(Date.parse(nowIso) + input.ttlMs).toISOString(),
      createdAt: nowIso,
    })
    .run();
  return token;
}

/** Jeton valable de ce type, sans le consommer. */
export function peekToken(db: Db, kind: TokenKind, token: string | undefined | null, nowIso: string) {
  if (!token || token.length > 100) return null;
  const row = db.select().from(authToken).where(and(eq(authToken.tokenHash, digest(token)), eq(authToken.kind, kind))).get();
  if (!row || row.expiresAt <= nowIso) return null;
  return row;
}

/** Jeton valable de ce type, supprimé au passage : un second usage échoue. */
export function consumeToken(db: Db, kind: TokenKind, token: string | undefined | null, nowIso: string) {
  const row = peekToken(db, kind, token, nowIso);
  if (!row) return null;
  const deleted = db.delete(authToken).where(eq(authToken.id, row.id)).run();
  return deleted.changes === 1 ? row : null;
}

/** Compte un essai sur un jeton (code du double facteur) ; au-delà de `max`, le jeton disparaît. */
export function countAttempt(db: Db, id: number, max: number): boolean {
  const row = db.select({ attempts: authToken.attempts }).from(authToken).where(eq(authToken.id, id)).get();
  if (!row) return false;
  if (row.attempts + 1 >= max) {
    db.delete(authToken).where(eq(authToken.id, id)).run();
    return false;
  }
  db.update(authToken).set({ attempts: row.attempts + 1 }).where(eq(authToken.id, id)).run();
  return true;
}

/** Invalide les jetons de ce type d'un compte (ex. un ancien lien quand un nouveau part). */
export function deleteUserTokens(db: Db, userId: number, kind: TokenKind) {
  db.delete(authToken).where(and(eq(authToken.userId, userId), eq(authToken.kind, kind))).run();
}

/** Efface les jetons expirés : à chaque émission, et lors du ménage du planificateur. */
export function purgeExpiredTokens(db: Db, nowIso: string) {
  db.delete(authToken).where(lt(authToken.expiresAt, nowIso)).run();
}
