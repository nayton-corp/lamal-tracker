import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNull, lt, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/infrastructure/db/client";
import { appUser, knownDevice, passkey, session } from "@/infrastructure/db/schema";
import { audit } from "./audit";
import { bumpUsage } from "./usage";
import { UserError } from "./errors";

/*
 * Comptes et sessions. Chaque compte a son courriel et son mot de passe, conservé haché (scrypt).
 * Le premier compte, créé au premier démarrage, est administrateur. Chaque appareil reçoit un jeton
 * aléatoire, stocké haché, qui expire et peut être révoqué. Les échecs répétés verrouillent le
 * compte un moment. Les messages d'échec sont les mêmes que le compte existe ou non.
 */

/** Longueur minimale d'un nouveau mot de passe (les anciens, plus courts, restent acceptés). */
export const MIN_PASSWORD_LENGTH = 12;
/** Durée d'une session sans activité ; chaque visite la prolonge. */
export const SESSION_DAYS = 30;
/** Durée maximale d'une session, même utilisée chaque jour. */
export const SESSION_MAX_DAYS = 90;
const MAX_FAILURES = 5;
const LOCK_MINUTES = [1, 2, 5, 15, 30];

interface StoredPassword {
  salt: string;
  hash: string;
  cost: number;
}

/**
 * Coût scrypt (N). Chaque hachage demande 128 × N × r octets de mémoire : 64 Mo à 2^16. Plus haut,
 * quelques connexions simultanées satureraient le conteneur (768 Mo). Les anciennes empreintes
 * (2^15) sont refaites au coût actuel à la connexion suivante.
 */
const COST = 2 ** 16;

function hashPassword(password: string, salt: Buffer, cost: number): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, 32, { N: cost, r: 8, p: 1, maxmem: 80 * 1024 * 1024 });
}

function hashed(password: string): StoredPassword {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: hashPassword(password, salt, COST).toString("base64"), cost: COST };
}

/** Hachage scrypt (sel et coût inclus) d'un nouveau mot de passe, après contrôle de sa longueur. */
export function storedPassword(password: string): StoredPassword {
  validatePassword(password);
  return hashed(password);
}

/** Vérification d'un mot de passe dans les fuites connues (null : service muet, on n'empêche rien). */
export type PwnedCheck = (password: string) => Promise<number | null>;

const emailSchema = z.string().trim().toLowerCase().max(200).pipe(z.email());

/** Courriel normalisé (minuscules, sans espaces), ou une erreur lisible. */
export function normalizeEmail(email: unknown): string {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) throw new UserError("Adresse de courriel invalide.");
  return parsed.data;
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

/** Contrôle de longueur seul, sans réseau ; `checkNewPassword` y ajoute les fuites connues. */
export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new UserError(`Le mot de passe doit compter au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  if (password.length > 200) throw new UserError("Mot de passe trop long.");
}

/** Contrôle d'un nouveau mot de passe : longueur, puis absence des fuites connues. */
export async function checkNewPassword(password: string, pwned: PwnedCheck) {
  validatePassword(password);
  const count = await pwned(password);
  if (count && count > 0) throw new UserError("Ce mot de passe figure dans des fuites de données connues : choisissez-en un autre.");
}

/**
 * Premier démarrage : crée le compte administrateur. Refusé dès qu'un compte existe. Son courriel
 * est tenu pour confirmé : c'est l'exploitant de l'instance qui l'installe.
 */
export function createFirstAdmin(db: Db, email: string, password: string, nowIso: string): number {
  const stored = storedPassword(password);
  const address = normalizeEmail(email);
  return db.transaction((tx) => {
    if (tx.select({ id: appUser.id }).from(appUser).limit(1).get()) throw new UserError("Un compte existe déjà.");
    const id = tx.insert(appUser).values({ email: address, emailVerifiedAt: nowIso, password: stored, role: "ADMIN" }).returning().get().id;
    bumpUsage(tx, "accounts.created");
    return id;
  });
}

/**
 * Administrateur d'avant les comptes par courriel (instance mise à jour) : il se connecte en
 * laissant le courriel vide, jusqu'à ce qu'il en enregistre un.
 */
export function legacyAdminId(db: Db): number | null {
  return (
    db
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(eq(appUser.role, "ADMIN"), isNull(appUser.email)))
      .orderBy(asc(appUser.id))
      .limit(1)
      .get()?.id ?? null
  );
}

export function userEmail(db: Db, userId: number): string | null {
  return db.select({ email: appUser.email }).from(appUser).where(eq(appUser.id, userId)).get()?.email ?? null;
}

/** `email` doit être déjà normalisé (`normalizeEmail`) : la recherche est exacte. */
export function findUserByEmail(db: Db, email: string) {
  return db.select().from(appUser).where(eq(appUser.email, email)).get() ?? null;
}

/** Compte utilisé par la connexion par mot de passe seul : le premier administrateur. */
export function primaryUserId(db: Db): number | null {
  return db.select({ id: appUser.id }).from(appUser).where(eq(appUser.role, "ADMIN")).orderBy(asc(appUser.id)).limit(1).get()?.id ?? null;
}

/** Remplace le mot de passe et lève le verrouillage ; les sessions ouvertes restent (à l'appelant de les fermer). */
export function setPassword(db: Db, userId: number, password: string) {
  db.update(appUser).set({ password: storedPassword(password), failedLogins: 0, lockedUntil: null }).where(eq(appUser.id, userId)).run();
}

/** Comparaison en temps constant, sans compter d'échec : la connexion passe par `attemptLogin`. */
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
    const stored = db.select({ password: appUser.password }).from(appUser).where(eq(appUser.id, userId)).get()?.password;
    // Empreinte d'un ancien coût : refaite maintenant que le mot de passe est connu (sans revalider ses règles).
    const upgrade = stored && stored.cost < COST ? { password: hashed(password) } : {};
    db.update(appUser).set({ failedLogins: 0, lockedUntil: null, ...upgrade }).where(eq(appUser.id, userId)).run();
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

// Empreinte de référence : un courriel inconnu coûte le même calcul qu'un mot de passe erroné.
const DECOY = { salt: Buffer.alloc(16), cost: COST };

export type LoginOutcome =
  | { kind: "ok"; userId: number }
  /** Mot de passe correct, double facteur à saisir. */
  | { kind: "mfa"; userId: number }
  /** Mot de passe correct, courriel pas encore confirmé. */
  | { kind: "unverified"; userId: number }
  /** Mot de passe correct, mais administrateur protégé par une passkey seule : elle est exigée. */
  | { kind: "passkey" }
  | { kind: "refused"; lockedSeconds: number };

/**
 * Connexion par courriel et mot de passe. Un courriel vide désigne l'administrateur d'une instance
 * mise à jour, tant qu'il n'a pas de courriel. Le résultat ne dit jamais si le compte existe.
 */
export function login(db: Db, input: { email: string; password: string }, options: { nowIso: string; mailEnabled: boolean }): LoginOutcome {
  const raw = input.email.trim();
  let userId: number | null = null;
  if (raw === "") userId = legacyAdminId(db);
  else {
    const parsed = emailSchema.safeParse(raw);
    if (parsed.success) userId = findUserByEmail(db, parsed.data)?.id ?? null;
  }
  const user = userId === null ? null : db.select().from(appUser).where(eq(appUser.id, userId)).get();
  if (!user || user.disabledAt) {
    hashPassword(input.password, DECOY.salt, DECOY.cost);
    return { kind: "refused", lockedSeconds: 0 };
  }
  const res = attemptLogin(db, user.id, input.password, options.nowIso);
  if (!res.ok) {
    audit(db, user.id, res.lockedSeconds > 0 ? "LOCKED" : "LOGIN_FAILED", { nowIso: options.nowIso });
    return { kind: "refused", lockedSeconds: res.lockedSeconds };
  }
  if (options.mailEnabled && user.email && !user.emailVerifiedAt) return { kind: "unverified", userId: user.id };
  if (user.totpEnabledAt) return { kind: "mfa", userId: user.id };
  // Le second facteur de l'administrateur est sa passkey : le mot de passe seul ne suffit pas.
  if (user.role === "ADMIN" && adminFactorRequired() && hasStrongFactor(db, user.id)) return { kind: "passkey" };
  return { kind: "ok", userId: user.id };
}

/** Nouveau mot de passe choisi depuis le compte : les autres appareils sont déconnectés. */
export async function changePassword(db: Db, userId: number, current: string, next: string, pwned: PwnedCheck, keepSessionId: string, nowIso: string) {
  requirePassword(db, userId, current, nowIso, "Mot de passe actuel incorrect.");
  await checkNewPassword(next, pwned);
  setPassword(db, userId, next);
  closeOtherSessions(db, userId, keepSessionId);
  audit(db, userId, "PASSWORD_CHANGED", { nowIso });
}

/** Passkey ou double facteur actif : un facteur au-delà du mot de passe. */
export function hasStrongFactor(db: Db, userId: number): boolean {
  const user = db.select({ totp: appUser.totpEnabledAt }).from(appUser).where(eq(appUser.id, userId)).get();
  if (user?.totp) return true;
  return db.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, userId)).limit(1).get() !== undefined;
}

const adminFactorRequired = (env: Record<string, string | undefined> = process.env) => env.ADMIN_REQUIRE_2FA !== "false";

/**
 * L'administrateur doit protéger son compte d'un second facteur (passkey ou TOTP) avant d'utiliser
 * l'app. ADMIN_REQUIRE_2FA=false lève l'obligation (instance strictement personnelle).
 */
export function adminNeedsFactor(db: Db, userId: number, env: Record<string, string | undefined> = process.env): boolean {
  if (!adminFactorRequired(env)) return false;
  const user = db.select({ role: appUser.role }).from(appUser).where(eq(appUser.id, userId)).get();
  return user?.role === "ADMIN" && !hasStrongFactor(db, userId);
}

/**
 * Appareil connu de ce compte ? Le jeton d'appareil vit dans un cookie de longue durée ; la base
 * n'en garde que l'empreinte. Renvoie `alert` quand il faut prévenir d'une connexion depuis un
 * nouvel appareil (pas pour le tout premier).
 */
export function rememberDevice(db: Db, userId: number, deviceToken: string, nowIso: string): { alert: boolean } {
  const deviceHash = createHash("sha256").update(deviceToken).digest("base64url");
  const known = db.select({ h: knownDevice.deviceHash }).from(knownDevice).where(eq(knownDevice.userId, userId)).all();
  if (known.some((k) => k.h === deviceHash)) {
    db.update(knownDevice).set({ lastSeenAt: nowIso }).where(and(eq(knownDevice.userId, userId), eq(knownDevice.deviceHash, deviceHash))).run();
    return { alert: false };
  }
  db.insert(knownDevice).values({ userId, deviceHash, lastSeenAt: nowIso }).run();
  return { alert: known.length > 0 };
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("base64");

/** Activité du compte : repousse la suppression pour inactivité et annule les rappels envoyés. */
export function markActive(db: Db, userId: number, nowIso: string) {
  db.update(appUser).set({ lastActiveAt: nowIso, inactivityNotices: 0, inactivityNoticeAt: null }).where(eq(appUser.id, userId)).run();
}

/**
 * Ouvre une session et renvoie le jeton à placer dans le cookie (jamais conservé en clair).
 * `confirmed` : l'identité vient d'être prouvée (mot de passe, passkey), la session est
 * « fraîche » quelques minutes ; un lien de courriel, lui, ne prouve que l'accès à la boîte.
 */
export function openSession(db: Db, userId: number, device: string, nowIso: string, confirmed = true): { id: string; token: string; expiresAt: string } {
  purgeExpiredSessions(db, nowIso);
  const token = randomBytes(32).toString("base64url");
  const id = randomBytes(8).toString("hex");
  const expiresAt = new Date(Date.parse(nowIso) + SESSION_DAYS * 86_400_000).toISOString();
  db.insert(session).values({ id, userId, tokenHash: tokenHash(token), device: device.slice(0, 200), createdAt: nowIso, lastSeenAt: nowIso, expiresAt, confirmedAt: confirmed ? nowIso : NEVER_CONFIRMED }).run();
  markActive(db, userId, nowIso);
  return { id, token, expiresAt };
}

export interface SessionInfo {
  id: string;
  userId: number;
  device: string;
  createdAt: string;
  lastSeenAt: string;
}

const maxEnd = (createdAt: string) => new Date(Date.parse(createdAt) + SESSION_MAX_DAYS * 86_400_000).toISOString();

/**
 * Session valable pour ce jeton ; prolonge l'expiration au passage (au plus une fois par heure),
 * sans dépasser 90 jours depuis l'ouverture. Un compte suspendu n'a plus de session valable.
 */
export function touchSession(db: Db, token: string | undefined, nowIso: string): SessionInfo | null {
  if (!token || token.length > 100) return null;
  const found = db
    .select({ row: session, disabledAt: appUser.disabledAt })
    .from(session)
    .innerJoin(appUser, eq(appUser.id, session.userId))
    .where(eq(session.tokenHash, tokenHash(token)))
    .get();
  if (!found || found.disabledAt) return null;
  const row = found.row;
  if (row.expiresAt <= nowIso || maxEnd(row.createdAt) <= nowIso) return null;
  if (Date.parse(nowIso) - Date.parse(row.lastSeenAt) > 3_600_000) {
    const idle = new Date(Date.parse(nowIso) + SESSION_DAYS * 86_400_000).toISOString();
    const max = maxEnd(row.createdAt);
    db.update(session).set({ lastSeenAt: nowIso, expiresAt: idle < max ? idle : max }).where(eq(session.id, row.id)).run();
    markActive(db, row.userId, nowIso);
  }
  return { id: row.id, userId: row.userId, device: row.device, createdAt: row.createdAt, lastSeenAt: row.lastSeenAt };
}

/** Déconnexion : supprime la session de ce jeton (sans effet s'il est absent). */
export function closeSession(db: Db, token: string | undefined) {
  if (!token) return;
  db.delete(session).where(eq(session.tokenHash, tokenHash(token))).run();
}

/** Durée pendant laquelle une identité confirmée ouvre les actions sensibles. */
export const CONFIRM_MINUTES = 10;

/** Date de confirmation d'une session ouverte sans preuve d'identité (lien de courriel). */
const NEVER_CONFIRMED = new Date(0).toISOString();

/**
 * Fin de la période de confirmation de cette session : ouverture (le mot de passe vient d'être
 * saisi) ou dernière confirmation par mot de passe ou passkey. Null si elle est passée.
 */
export function confirmedUntil(db: Db, sessionId: string, nowIso: string, minutes = CONFIRM_MINUTES): string | null {
  const row = db.select({ createdAt: session.createdAt, confirmedAt: session.confirmedAt }).from(session).where(eq(session.id, sessionId)).get();
  if (!row) return null;
  const last = row.confirmedAt ?? row.createdAt;
  const until = new Date(Date.parse(last) + minutes * 60_000).toISOString();
  return until > nowIso ? until : null;
}

/** Identité confirmée il y a moins de `minutes` : inutile de redemander le mot de passe. */
export function isFreshSession(db: Db, sessionId: string, nowIso: string, minutes = CONFIRM_MINUTES): boolean {
  return confirmedUntil(db, sessionId, nowIso, minutes) !== null;
}

/** Export, suppression : refusés sans confirmation récente de l'identité. */
export function requireConfirmed(db: Db, sessionId: string, nowIso: string) {
  if (!isFreshSession(db, sessionId, nowIso)) throw new UserError("Confirmez d'abord votre identité (mot de passe ou passkey).");
}

/** Marque la session comme confirmée (passkey vérifiée par l'appelant). */
export function markConfirmed(db: Db, sessionId: string, nowIso: string) {
  db.update(session).set({ confirmedAt: nowIso }).where(eq(session.id, sessionId)).run();
}

/** Confirmation par mot de passe ; les échecs comptent pour le verrouillage du compte. */
export function confirmWithPassword(db: Db, userId: number, sessionId: string, password: string, nowIso: string) {
  requirePassword(db, userId, password, nowIso);
  markConfirmed(db, sessionId, nowIso);
}

/**
 * Mot de passe redemandé dans le compte (changer de courriel, ajouter un facteur…). Les échecs
 * comptent comme des échecs de connexion : verrou, journal. Une session volée ne permet donc pas
 * de deviner le mot de passe à l'infini.
 */
export function requirePassword(db: Db, userId: number, password: string, nowIso: string, wrongMessage = "Mot de passe incorrect.") {
  const res = attemptLogin(db, userId, password, nowIso);
  if (res.ok) return;
  audit(db, userId, res.lockedSeconds > 0 ? "LOCKED" : "LOGIN_FAILED", { nowIso });
  if (res.lockedSeconds > 0) throw new UserError(`Trop d'essais : réessayez dans ${Math.ceil(res.lockedSeconds / 60)} min.`);
  throw new UserError(wrongMessage);
}

/** Ferme toutes les sessions d'un compte (réinitialisation du mot de passe, suspension). */
export function closeAllSessions(db: Db, userId: number) {
  db.delete(session).where(eq(session.userId, userId)).run();
}

/** Ferme les autres sessions du même compte (« déconnecter les autres appareils »). */
export function closeOtherSessions(db: Db, userId: number, keepId: string) {
  db.delete(session).where(and(eq(session.userId, userId), ne(session.id, keepId))).run();
}

/** Sessions actives du compte (les expirées sont purgées au passage), la plus récemment utilisée d'abord. */
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
  db.delete(session).where(lt(session.createdAt, new Date(Date.parse(nowIso) - SESSION_MAX_DAYS * 86_400_000).toISOString())).run();
}

/** Nom lisible d'un appareil à partir de son User-Agent, pour la liste des sessions. */
export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Appareil";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "navigateur";
  return `${os} · ${browser}`;
}
