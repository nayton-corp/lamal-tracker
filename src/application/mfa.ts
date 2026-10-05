import { randomInt } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { appUser, auditEvent, passkey, recoveryCode } from "@/infrastructure/db/schema";
import { totpContext } from "@/infrastructure/crypto/legacy";
import { openSecret, sealSecret } from "@/infrastructure/crypto/vault";
import { audit } from "./audit";
import { requirePassword } from "./auth";
import { UserError } from "./errors";
import { consumeToken, countAttempt, digest, issueToken, peekToken } from "./tokens";
import { newTotpSecret, totpUri, verifyTotp } from "./totp";

/*
 * Double facteur : code à 6 chiffres d'une application d'authentification (TOTP), et dix codes de
 * secours à usage unique (16 caractères) remis à l'activation. À la connexion, le mot de passe correct ouvre une
 * étape d'attente de 5 minutes, limitée à 5 essais, avant la session. Le secret TOTP est gardé
 * chiffré par la clé maître, y compris pendant l'activation.
 */

const setupContext = (userId: number) => `totp-setup:${userId}`;

/** Secret provisoire d'un jeton d'activation, déchiffré ; vide s'il est illisible. */
function setupSecret(db: Db, userId: number, data: Record<string, unknown> | null): string {
  return openSecret(db, String(data?.secret ?? ""), setupContext(userId)) ?? "";
}

export const RECOVERY_CODE_COUNT = 10;
const SETUP_MINUTES = 15;
const LOGIN_MINUTES = 5;
const MAX_CODE_ATTEMPTS = 5;
/** Codes erronés tolérés par compte sur 24 heures, toutes étapes confondues ; ensuite, passkey seule. */
export const MAX_FACTOR_FAILURES_PER_DAY = 10;
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** 16 caractères parmi 31 ≈ 79 bits : impossible à deviner, même avec l'empreinte en main. */
const RECOVERY_LENGTH = 16;
/** Ancien format (10 caractères), encore accepté jusqu'à la prochaine régénération des codes. */
const LEGACY_RECOVERY_LENGTH = 10;

const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Empreinte d'un code de secours, propre au compte (deux comptes n'ont jamais la même). */
function recoveryHash(userId: number, normalized: string): string {
  return normalized.length === LEGACY_RECOVERY_LENGTH ? digest(normalized) : digest(`${userId}:${normalized}`);
}

/** « abcd-efgh-jkmn-pqrs » : tirage uniforme (randomInt, sans biais de modulo). */
function newRecoveryCode(): string {
  const chars = Array.from({ length: RECOVERY_LENGTH }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
  return chars.match(/.{4}/g)!.join("-");
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
    for (const code of codes) tx.insert(recoveryCode).values({ userId, codeHash: recoveryHash(userId, normalizeRecovery(code)) }).run();
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
  requirePassword(db, userId, password, nowIso);
  const secret = newTotpSecret();
  const token = issueToken(db, { userId, kind: "TOTP_SETUP", ttlMs: SETUP_MINUTES * 60_000, data: { secret: sealSecret(db, secret, setupContext(userId)) } }, nowIso);
  return { token, secret, uri: totpUri(secret, user.email ?? "administrateur") };
}

/** Le premier code juste active le double facteur ; renvoie les codes de secours à noter. */
export function confirmTotpSetup(db: Db, userId: number, token: string | undefined, code: string, nowMs: number, nowIso: string): string[] {
  const row = peekToken(db, "TOTP_SETUP", token, nowIso);
  const secret = row && row.userId === userId ? setupSecret(db, userId, row.data) : "";
  if (!row || !secret) throw new UserError("Activation expirée : recommencez.");
  const step = verifyTotp(secret, code, nowMs, null);
  if (step === null) {
    if (!countAttempt(db, row.id, MAX_CODE_ATTEMPTS)) throw new UserError("Trop d'essais : recommencez l'activation.");
    throw new UserError("Code incorrect. Vérifiez l'heure du téléphone et saisissez le code affiché.");
  }
  consumeToken(db, "TOTP_SETUP", token, nowIso);
  db.update(appUser).set({ totpSecret: sealSecret(db, secret, totpContext(userId)), totpEnabledAt: nowIso, totpLastStep: step }).where(eq(appUser.id, userId)).run();
  audit(db, userId, "TOTP_ENABLED", { nowIso });
  return replaceRecoveryCodes(db, userId);
}

/** Remplace tous les codes de secours (les anciens ne valent plus rien) ; mot de passe exigé. */
export function regenerateRecoveryCodes(db: Db, userId: number, password: string, nowIso: string): string[] {
  if (!userRow(db, userId).totpEnabledAt) throw new UserError("Activez d'abord le double facteur.");
  requirePassword(db, userId, password, nowIso);
  audit(db, userId, "RECOVERY_REGENERATED", { nowIso });
  return replaceRecoveryCodes(db, userId);
}

/** Désactive le double facteur et efface les codes de secours ; refusé à un administrateur sans passkey. */
export function disableTotp(db: Db, userId: number, password: string, nowIso: string) {
  const user = userRow(db, userId);
  if (!user.totpEnabledAt) return;
  requirePassword(db, userId, password, nowIso);
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
  // Secret illisible (clé maître changée) : seuls les codes de secours restent utilisables.
  const secret = openSecret(db, user.totpSecret, totpContext(userId));
  const step = secret ? verifyTotp(secret, code, nowMs, user.totpLastStep) : null;
  if (step !== null) {
    db.update(appUser).set({ totpLastStep: step }).where(eq(appUser.id, userId)).run();
    return true;
  }
  const normalized = normalizeRecovery(code);
  if (normalized.length !== RECOVERY_LENGTH && normalized.length !== LEGACY_RECOVERY_LENGTH) return false;
  const used = db
    .update(recoveryCode)
    .set({ usedAt: nowIso })
    .where(and(eq(recoveryCode.userId, userId), eq(recoveryCode.codeHash, recoveryHash(userId, normalized)), isNull(recoveryCode.usedAt)))
    .run();
  if (used.changes !== 1) return false;
  audit(db, userId, "RECOVERY_USED", { nowIso });
  return true;
}

/** Trop de codes erronés pour ce compte depuis 24 heures : le double facteur est bloqué. */
export function secondFactorLocked(db: Db, userId: number, nowIso: string): boolean {
  const since = new Date(Date.parse(nowIso) - 24 * 3600_000).toISOString();
  const row = db
    .select({ n: count() })
    .from(auditEvent)
    .where(and(eq(auditEvent.userId, userId), eq(auditEvent.kind, "MFA_FAILED"), gt(auditEvent.createdAt, since)))
    .get();
  return (row?.n ?? 0) >= MAX_FACTOR_FAILURES_PER_DAY;
}

export const FACTOR_LOCKED = "Trop de codes incorrects aujourd'hui : réessayez demain, ou connectez-vous avec une passkey.";

/**
 * Contrôle d'un code de double facteur, avec limite par compte : un mot de passe ou un lien de
 * réinitialisation volé ne suffit pas à essayer les codes un par un, quel que soit le nombre de
 * jetons d'attente ouverts. Chaque échec est journalisé.
 */
export function checkSecondFactor(db: Db, userId: number, code: string, nowMs: number, nowIso: string): "ok" | "wrong" | "locked" {
  if (secondFactorLocked(db, userId, nowIso)) return "locked";
  if (verifySecondFactor(db, userId, code, nowMs, nowIso)) return "ok";
  audit(db, userId, "MFA_FAILED", { nowIso });
  return "wrong";
}

/** Mot de passe correct, double facteur actif : jeton d'attente à garder dans un cookie. */
export function startMfaLogin(db: Db, userId: number, nowIso: string): string {
  return issueToken(db, { userId, kind: "LOGIN_MFA", ttlMs: LOGIN_MINUTES * 60_000 }, nowIso);
}

/** Une connexion attend-elle son code de double facteur (jeton du cookie encore valable) ? */
export function pendingMfaLogin(db: Db, token: string | undefined, nowIso: string): boolean {
  return peekToken(db, "LOGIN_MFA", token, nowIso) !== null;
}

export type MfaOutcome = { ok: true; userId: number } | { ok: false; error: string; restart: boolean };

/** Seconde étape de la connexion. `restart` : le jeton est perdu (expiré, bloqué, trop d'essais), retour au mot de passe. */
export function finishMfaLogin(db: Db, token: string | undefined, code: string, nowMs: number, nowIso: string): MfaOutcome {
  const row = peekToken(db, "LOGIN_MFA", token, nowIso);
  if (!row?.userId) return { ok: false, error: "Étape expirée : reconnectez-vous.", restart: true };
  const result = checkSecondFactor(db, row.userId, code, nowMs, nowIso);
  if (result === "ok") {
    consumeToken(db, "LOGIN_MFA", token, nowIso);
    return { ok: true, userId: row.userId };
  }
  if (result === "locked") {
    consumeToken(db, "LOGIN_MFA", token, nowIso);
    return { ok: false, error: FACTOR_LOCKED, restart: true };
  }
  if (!countAttempt(db, row.id, MAX_CODE_ATTEMPTS)) return { ok: false, error: "Trop d'essais : reconnectez-vous.", restart: true };
  return { ok: false, error: "Code incorrect.", restart: false };
}
