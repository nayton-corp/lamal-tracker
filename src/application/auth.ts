import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, asc, eq, lt, ne } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { appUser, session } from "@/infrastructure/db/schema";
import { UserError } from "./errors";

/*
 * Comptes et sessions. Chaque compte a son mot de passe, conservé haché (scrypt). Le premier
 * compte, créé au premier démarrage, est administrateur. Chaque appareil reçoit un jeton aléatoire,
 * stocké haché, qui expire et peut être révoqué. Les échecs répétés verrouillent le compte un moment.
 */

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

const COST = 2 ** 15;

function hashPassword(password: string, salt: Buffer, cost: number): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, 32, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function storedPassword(password: string): StoredPassword {
  validatePassword(password);
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: hashPassword(password, salt, COST).toString("base64"), cost: COST };
}

/** L'instance a-t-elle au moins un compte ? Sinon, tout mène à la création du premier. */
export function hasAnyUser(db: Db): boolean {
  return db.select({ id: appUser.id }).from(appUser).limit(1).get() !== undefined;
}

/**
 * Mot de passe à (re)définir : aucun compte, ou mot de passe de l'administrateur effacé (procédure
 * « mot de passe oublié » du README : son hachage est vidé en base, ses données restent).
 */
export function passwordToDefine(db: Db): boolean {
  const id = primaryUserId(db);
  if (id === null) return true;
  return !db.select({ password: appUser.password }).from(appUser).where(eq(appUser.id, id)).get()!.password.hash;
}

export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new UserError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  if (password.length > 200) throw new UserError("Mot de passe trop long.");
}

/** Premier démarrage : crée le compte administrateur. Refusé dès qu'un compte existe. */
export function createFirstAdmin(db: Db, password: string): number {
  const stored = storedPassword(password);
  return db.transaction((tx) => {
    if (tx.select({ id: appUser.id }).from(appUser).limit(1).get()) throw new UserError("Un compte existe déjà.");
    return tx.insert(appUser).values({ password: stored, role: "ADMIN" }).returning().get().id;
  });
}

/** Compte utilisé par la connexion par mot de passe seul : le premier administrateur. */
export function primaryUserId(db: Db): number | null {
  return db.select({ id: appUser.id }).from(appUser).where(eq(appUser.role, "ADMIN")).orderBy(asc(appUser.id)).limit(1).get()?.id ?? null;
}

export function setPassword(db: Db, userId: number, password: string) {
  db.update(appUser).set({ password: storedPassword(password), failedLogins: 0, lockedUntil: null }).where(eq(appUser.id, userId)).run();
}

export function verifyPassword(db: Db, userId: number, password: string): boolean {
  const user = db.select({ password: appUser.password }).from(appUser).where(eq(appUser.id, userId)).get();
  if (!user) return false;
  const stored = user.password;
  if (!stored.hash) return false;
  const expected = Buffer.from(stored.hash, "base64");
  const given = hashPassword(password, Buffer.from(stored.salt, "base64"), stored.cost);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Verrou en cours sur ce compte ? Renvoie les secondes restantes, sinon 0. */
export function lockSeconds(db: Db, userId: number, nowIso: string): number {
  const user = db.select({ lockedUntil: appUser.lockedUntil }).from(appUser).where(eq(appUser.id, userId)).get();
  if (!user?.lockedUntil) return 0;
  const remaining = Math.ceil((Date.parse(user.lockedUntil) - Date.parse(nowIso)) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Tentative de connexion à un compte : à partir de 5 échecs, verrou d'une minute, puis 2, 5, 15 et
 * 30 minutes. Un succès remet le compteur à zéro.
 */
export function attemptLogin(db: Db, userId: number, password: string, nowIso: string): { ok: true } | { ok: false; lockedSeconds: number } {
  const locked = lockSeconds(db, userId, nowIso);
  if (locked > 0) return { ok: false, lockedSeconds: locked };
  if (verifyPassword(db, userId, password)) {
    db.update(appUser).set({ failedLogins: 0, lockedUntil: null }).where(eq(appUser.id, userId)).run();
    return { ok: true };
  }
  const user = db.select({ failedLogins: appUser.failedLogins }).from(appUser).where(eq(appUser.id, userId)).get();
  const count = (user?.failedLogins ?? 0) + 1;
  let lockedUntil: string | null = null;
  if (count >= MAX_FAILURES) {
    const minutes = LOCK_MINUTES[Math.min(count - MAX_FAILURES, LOCK_MINUTES.length - 1)]!;
    lockedUntil = new Date(Date.parse(nowIso) + minutes * 60_000).toISOString();
  }
  db.update(appUser).set({ failedLogins: count, lockedUntil }).where(eq(appUser.id, userId)).run();
  return { ok: false, lockedSeconds: lockedUntil ? Math.ceil((Date.parse(lockedUntil) - Date.parse(nowIso)) / 1000) : 0 };
}

export function changePassword(db: Db, userId: number, current: string, next: string) {
  if (!verifyPassword(db, userId, current)) throw new UserError("Mot de passe actuel incorrect.");
  setPassword(db, userId, next);
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("base64");

/** Ouvre une session et renvoie le jeton à placer dans le cookie (jamais conservé en clair). */
export function openSession(db: Db, userId: number, device: string, nowIso: string): { id: string; token: string; expiresAt: string } {
  purgeExpiredSessions(db, nowIso);
  const token = randomBytes(32).toString("base64url");
  const id = randomBytes(8).toString("hex");
  const expiresAt = new Date(Date.parse(nowIso) + SESSION_DAYS * 86_400_000).toISOString();
  db.insert(session).values({ id, userId, tokenHash: tokenHash(token), device: device.slice(0, 200), createdAt: nowIso, lastSeenAt: nowIso, expiresAt }).run();
  return { id, token, expiresAt };
}

export interface SessionInfo {
  id: string;
  userId: number;
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
  return { id: row.id, userId: row.userId, device: row.device, createdAt: row.createdAt, lastSeenAt: row.lastSeenAt };
}

export function closeSession(db: Db, token: string | undefined) {
  if (!token) return;
  db.delete(session).where(eq(session.tokenHash, tokenHash(token))).run();
}

/** Ferme les autres sessions du même compte (« déconnecter les autres appareils »). */
export function closeOtherSessions(db: Db, userId: number, keepId: string) {
  db.delete(session).where(and(eq(session.userId, userId), ne(session.id, keepId))).run();
}

export function listSessions(db: Db, userId: number, nowIso: string): Omit<SessionInfo, "userId">[] {
  purgeExpiredSessions(db, nowIso);
  return db
    .select({ id: session.id, device: session.device, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt })
    .from(session)
    .where(eq(session.userId, userId))
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
