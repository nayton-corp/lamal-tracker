import { randomBytes } from "node:crypto";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { appUser, passkey, recoveryCode } from "@/infrastructure/db/schema";
import { audit } from "./audit";
import { verifyPassword } from "./auth";
import { UserError } from "./errors";
import { consumeToken, countAttempt, digest, issueToken, peekToken } from "./tokens";
import { newTotpSecret, totpUri, verifyTotp } from "./totp";

/*
 * Double facteur : code à 6 chiffres d'une application d'authentification (TOTP), et dix codes de
 * secours à usage unique remis à l'activation. À la connexion, le mot de passe correct ouvre une
 * étape d'attente de 5 minutes, limitée à 5 essais, avant la session.
 */

export const RECOVERY_CODE_COUNT = 10;
const SETUP_MINUTES = 15;
const LOGIN_MINUTES = 5;
const MAX_CODE_ATTEMPTS = 5;
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

function newRecoveryCode(): string {
  const bytes = randomBytes(10);
  const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

function userRow(db: Db, userId: number) {
  const user = db.select().from(appUser).where(eq(appUser.id, userId)).get();
  if (!user) throw new UserError("Compte introuvable.");
  return user;
}

/** Remplace les codes de secours ; les nouveaux ne sont montrés qu'une fois. */
function replaceRecoveryCodes(db: Db, userId: number): string[] {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  db.transaction((tx) => {
    tx.delete(recoveryCode).where(eq(recoveryCode.userId, userId)).run();
    for (const code of codes) tx.insert(recoveryCode).values({ userId, codeHash: digest(normalizeRecovery(code)) }).run();
  });
  return codes;
}

export function recoveryCodesLeft(db: Db, userId: number): number {
  return db.select({ n: count() }).from(recoveryCode).where(and(eq(recoveryCode.userId, userId), isNull(recoveryCode.usedAt))).get()!.n;
}

/** Première étape de l'activation : un secret provisoire, à confirmer par un premier code. */
export function startTotpSetup(db: Db, userId: number, password: string, nowIso: string): { token: string; secret: string; uri: string } {
  const user = userRow(db, userId);
  if (user.totpEnabledAt) throw new UserError("Le double facteur est déjà actif.");
  if (!verifyPassword(db, userId, password)) throw new UserError("Mot de passe incorrect.");
  const secret = newTotpSecret();
  const token = issueToken(db, { userId, kind: "TOTP_SETUP", ttlMs: SETUP_MINUTES * 60_000, data: { secret } }, nowIso);
  return { token, secret, uri: totpUri(secret, user.email ?? "administrateur") };
}

/** Secret provisoire encore valable (page d'activation rechargée). */
export function pendingTotpSetup(db: Db, userId: number, token: string | undefined, nowIso: string): { secret: string; uri: string } | null {
  const row = peekToken(db, "TOTP_SETUP", token, nowIso);
  if (!row || row.userId !== userId) return null;
  const secret = String(row.data?.secret ?? "");
  return { secret, uri: totpUri(secret, userRow(db, userId).email ?? "administrateur") };
}

/** Le premier code juste active le double facteur ; renvoie les codes de secours à noter. */
export function confirmTotpSetup(db: Db, userId: number, token: string | undefined, code: string, nowMs: number, nowIso: string): string[] {
  const row = peekToken(db, "TOTP_SETUP", token, nowIso);
  if (!row || row.userId !== userId) throw new UserError("Activation expirée : recommencez.");
  const secret = String(row.data?.secret ?? "");
  const step = verifyTotp(secret, code, nowMs, null);
  if (step === null) {
    if (!countAttempt(db, row.id, MAX_CODE_ATTEMPTS)) throw new UserError("Trop d'essais : recommencez l'activation.");
    throw new UserError("Code incorrect. Vérifiez l'heure du téléphone et saisissez le code affiché.");
  }
  consumeToken(db, "TOTP_SETUP", token, nowIso);
  db.update(appUser).set({ totpSecret: secret, totpEnabledAt: nowIso, totpLastStep: step }).where(eq(appUser.id, userId)).run();
  audit(db, userId, "TOTP_ENABLED", { nowIso });
  return replaceRecoveryCodes(db, userId);
}

export function regenerateRecoveryCodes(db: Db, userId: number, password: string, nowIso: string): string[] {
  if (!userRow(db, userId).totpEnabledAt) throw new UserError("Activez d'abord le double facteur.");
  if (!verifyPassword(db, userId, password)) throw new UserError("Mot de passe incorrect.");
  audit(db, userId, "RECOVERY_REGENERATED", { nowIso });
  return replaceRecoveryCodes(db, userId);
}

export function disableTotp(db: Db, userId: number, password: string, nowIso: string) {
  const user = userRow(db, userId);
  if (!user.totpEnabledAt) return;
  if (!verifyPassword(db, userId, password)) throw new UserError("Mot de passe incorrect.");
  const hasPasskey = db.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, userId)).limit(1).get();
  if (user.role === "ADMIN" && !hasPasskey) throw new UserError("L'administrateur doit garder un second facteur : ajoutez d'abord une passkey.");
  db.transaction((tx) => {
    tx.update(appUser).set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null }).where(eq(appUser.id, userId)).run();
    tx.delete(recoveryCode).where(eq(recoveryCode.userId, userId)).run();
  });
  audit(db, userId, "TOTP_DISABLED", { nowIso });
}

/** Code de l'application, ou code de secours (consommé). */
export function verifySecondFactor(db: Db, userId: number, code: string, nowMs: number, nowIso: string): boolean {
  const user = userRow(db, userId);
  if (!user.totpEnabledAt || !user.totpSecret) return false;
  const step = verifyTotp(user.totpSecret, code, nowMs, user.totpLastStep);
  if (step !== null) {
    db.update(appUser).set({ totpLastStep: step }).where(eq(appUser.id, userId)).run();
    return true;
  }
  const normalized = normalizeRecovery(code);
  if (normalized.length !== 10) return false;
  const used = db
    .update(recoveryCode)
    .set({ usedAt: nowIso })
    .where(and(eq(recoveryCode.userId, userId), eq(recoveryCode.codeHash, digest(normalized)), isNull(recoveryCode.usedAt)))
    .run();
  if (used.changes !== 1) return false;
  audit(db, userId, "RECOVERY_USED", { nowIso });
  return true;
}

/** Mot de passe correct, double facteur actif : jeton d'attente à garder dans un cookie. */
export function startMfaLogin(db: Db, userId: number, nowIso: string): string {
  return issueToken(db, { userId, kind: "LOGIN_MFA", ttlMs: LOGIN_MINUTES * 60_000 }, nowIso);
}

export function pendingMfaLogin(db: Db, token: string | undefined, nowIso: string): boolean {
  return peekToken(db, "LOGIN_MFA", token, nowIso) !== null;
}

export type MfaOutcome = { ok: true; userId: number } | { ok: false; error: string; restart: boolean };

export function finishMfaLogin(db: Db, token: string | undefined, code: string, nowMs: number, nowIso: string): MfaOutcome {
  const row = peekToken(db, "LOGIN_MFA", token, nowIso);
  if (!row?.userId) return { ok: false, error: "Étape expirée : reconnectez-vous.", restart: true };
  if (verifySecondFactor(db, row.userId, code, nowMs, nowIso)) {
    consumeToken(db, "LOGIN_MFA", token, nowIso);
    return { ok: true, userId: row.userId };
  }
  audit(db, row.userId, "MFA_FAILED", { nowIso });
  if (!countAttempt(db, row.id, MAX_CODE_ATTEMPTS)) return { ok: false, error: "Trop d'essais : reconnectez-vous.", restart: true };
  return { ok: false, error: "Code incorrect.", restart: false };
}
