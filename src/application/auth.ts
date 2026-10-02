import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { session } from "@/infrastructure/db/schema";
import { getSetting, setSetting } from "@/infrastructure/db/settings";
import { UserError } from "./review";

/*
 * Connexion par mot de passe, obligatoire : il est choisi dans l'app au premier démarrage et
 * conservé haché (scrypt). Chaque appareil reçoit un jeton aléatoire, stocké haché, qui expire
 * et peut être révoqué. Les échecs répétés verrouillent la connexion un moment.
 */

const PASSWORD_KEY = "auth.password";
const FAILURES_KEY = "auth.failures";
export const MIN_PASSWORD_LENGTH = 8;
/** Durée d'une session sans activité ; chaque visite la prolonge. */
export const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
const LOCK_MINUTES = [1, 2, 5, 15, 30];

interface StoredPassword {
  salt: string;
  hash: string;
  cost: number;
}

interface Failures {
  count: number;
  lockedUntil: string | null;
}

const COST = 2 ** 15;

function hashPassword(password: string, salt: Buffer, cost: number): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, 32, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function hasPassword(db: Db): boolean {
  return getSetting<StoredPassword>(db, PASSWORD_KEY) !== null;
}

export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new UserError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  if (password.length > 200) throw new UserError("Mot de passe trop long.");
}

export function setPassword(db: Db, password: string) {
  validatePassword(password);
  const salt = randomBytes(16);
  setSetting(db, PASSWORD_KEY, { salt: salt.toString("base64"), hash: hashPassword(password, salt, COST).toString("base64"), cost: COST } satisfies StoredPassword);
  setSetting(db, FAILURES_KEY, { count: 0, lockedUntil: null } satisfies Failures);
}

export function verifyPassword(db: Db, password: string): boolean {
  const stored = getSetting<StoredPassword>(db, PASSWORD_KEY);
  if (!stored) return false;
  const expected = Buffer.from(stored.hash, "base64");
  const given = hashPassword(password, Buffer.from(stored.salt, "base64"), stored.cost);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Verrou en cours ? Renvoie les secondes restantes, sinon 0. */
export function lockSeconds(db: Db, nowIso: string): number {
  const f = getSetting<Failures>(db, FAILURES_KEY);
  if (!f?.lockedUntil) return 0;
  const remaining = Math.ceil((Date.parse(f.lockedUntil) - Date.parse(nowIso)) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Tentative de connexion : à partir de 5 échecs, verrou d'une minute, puis 2, 5, 15 et 30
 * minutes. Un succès remet le compteur à zéro.
 */
export function attemptLogin(db: Db, password: string, nowIso: string): { ok: true } | { ok: false; lockedSeconds: number } {
  const locked = lockSeconds(db, nowIso);
  if (locked > 0) return { ok: false, lockedSeconds: locked };
  if (verifyPassword(db, password)) {
    setSetting(db, FAILURES_KEY, { count: 0, lockedUntil: null } satisfies Failures);
    return { ok: true };
  }
  const f = getSetting<Failures>(db, FAILURES_KEY) ?? { count: 0, lockedUntil: null };
  const count = f.count + 1;
  let lockedUntil: string | null = null;
  if (count >= MAX_FAILURES) {
    const minutes = LOCK_MINUTES[Math.min(count - MAX_FAILURES, LOCK_MINUTES.length - 1)]!;
    lockedUntil = new Date(Date.parse(nowIso) + minutes * 60_000).toISOString();
  }
  setSetting(db, FAILURES_KEY, { count, lockedUntil } satisfies Failures);
  return { ok: false, lockedSeconds: lockedUntil ? Math.ceil((Date.parse(lockedUntil) - Date.parse(nowIso)) / 1000) : 0 };
}

export function changePassword(db: Db, current: string, next: string) {
  if (!verifyPassword(db, current)) throw new UserError("Mot de passe actuel incorrect.");
  setPassword(db, next);
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("base64");

/** Ouvre une session et renvoie le jeton à placer dans le cookie (jamais conservé en clair). */
export function openSession(db: Db, device: string, nowIso: string): { id: string; token: string; expiresAt: string } {
  purgeExpiredSessions(db, nowIso);
  const token = randomBytes(32).toString("base64url");
  const id = randomBytes(8).toString("hex");
  const expiresAt = new Date(Date.parse(nowIso) + SESSION_DAYS * 86_400_000).toISOString();
  db.insert(session).values({ id, tokenHash: tokenHash(token), device: device.slice(0, 200), createdAt: nowIso, lastSeenAt: nowIso, expiresAt }).run();
  return { id, token, expiresAt };
}

export interface SessionInfo {
  id: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
}

/** Session valable pour ce jeton ; prolonge l'expiration au passage (au plus une fois par heure). */
export function touchSession(db: Db, token: string | undefined, nowIso: string): SessionInfo | null {
  if (!token || token.length > 100) return null;
  const row = db.select().from(session).where(eq(session.tokenHash, tokenHash(token))).get();
  if (!row || row.expiresAt <= nowIso) return null;
  if (Date.parse(nowIso) - Date.parse(row.lastSeenAt) > 3_600_000) {
    const expiresAt = new Date(Date.parse(nowIso) + SESSION_DAYS * 86_400_000).toISOString();
    db.update(session).set({ lastSeenAt: nowIso, expiresAt }).where(eq(session.id, row.id)).run();
  }
  return { id: row.id, device: row.device, createdAt: row.createdAt, lastSeenAt: row.lastSeenAt };
}

export function closeSession(db: Db, token: string | undefined) {
  if (!token) return;
  db.delete(session).where(eq(session.tokenHash, tokenHash(token))).run();
}

/** Ferme toutes les sessions sauf celle indiquée (« déconnecter les autres appareils »). */
export function closeOtherSessions(db: Db, keepId: string) {
  for (const s of db.select({ id: session.id }).from(session).all()) if (s.id !== keepId) db.delete(session).where(eq(session.id, s.id)).run();
}

export function listSessions(db: Db, nowIso: string): SessionInfo[] {
  purgeExpiredSessions(db, nowIso);
  return db
    .select({ id: session.id, device: session.device, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt })
    .from(session)
    .all()
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

function purgeExpiredSessions(db: Db, nowIso: string) {
  db.delete(session).where(lt(session.expiresAt, nowIso)).run();
}

/** Nom lisible d'un appareil à partir de son User-Agent, pour la liste des sessions. */
export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Appareil";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navigateur";
  return `${os} · ${browser}`;
}
