import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, count, eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { appUser, passkey } from "@/infrastructure/db/schema";
import { audit } from "./audit";
import { requirePassword } from "./auth";
import { UserError } from "./errors";
import { consumeToken, issueToken } from "./tokens";

/*
 * Passkeys (WebAuthn) : Face ID, Touch ID, empreinte ou clé de sécurité. Une passkey suffit à se
 * connecter : elle vaut mot de passe et double facteur à la fois (vérification de l'utilisateur
 * exigée). Le défi de chaque cérémonie est un jeton à usage unique de 5 minutes.
 */

/** Site pour lequel les passkeys sont créées : nom de domaine et origine exacte de l'app. */
export interface RelyingParty {
  id: string;
  name: string;
  origin: string;
}

const CHALLENGE_MINUTES = 5;
const MAX_PASSKEYS = 10;

const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromBase64Url = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));

/** Options de création d'une passkey, et le jeton du défi à garder dans un cookie. */
export async function passkeyRegistrationOptions(db: Db, userId: number, rp: RelyingParty, nowIso: string): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; token: string }> {
  const user = db.select().from(appUser).where(eq(appUser.id, userId)).get();
  if (!user) throw new UserError("Compte introuvable.");
  const existing = db.select({ id: passkey.id, transports: passkey.transports }).from(passkey).where(eq(passkey.userId, userId)).all();
  if (existing.length >= MAX_PASSKEYS) throw new UserError(`Au plus ${MAX_PASSKEYS} passkeys par compte.`);
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: user.email ?? "administrateur",
    userID: new TextEncoder().encode(`lamal-user-${userId}`),
    attestationType: "none",
    excludeCredentials: existing.map((k) => ({ id: k.id, transports: k.transports ?? undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const token = issueToken(db, { userId, kind: "WEBAUTHN", ttlMs: CHALLENGE_MINUTES * 60_000, data: { challenge: options.challenge, purpose: "register" } }, nowIso);
  return { options, token };
}

export async function finishPasskeyRegistration(
  db: Db,
  userId: number,
  token: string | undefined,
  response: RegistrationResponseJSON,
  rp: RelyingParty,
  name: string,
  nowIso: string,
) {
  const row = consumeToken(db, "WEBAUTHN", token, nowIso);
  if (!row || row.userId !== userId || row.data?.purpose !== "register") throw new UserError("Demande expirée : recommencez.");
  let verified;
  try {
    verified = await verifyRegistrationResponse({
      response,
      expectedChallenge: String(row.data.challenge),
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    });
  } catch {
    throw new UserError("La passkey n'a pas pu être vérifiée.");
  }
  if (!verified.verified) throw new UserError("La passkey n'a pas pu être vérifiée.");
  const { credential } = verified.registrationInfo;
  db.insert(passkey)
    .values({
      id: credential.id,
      userId,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? null,
      name: name.slice(0, 80),
      createdAt: nowIso,
    })
    .onConflictDoNothing()
    .run();
  audit(db, userId, "PASSKEY_ADDED", { detail: name, nowIso });
}

/** Options de connexion par passkey : aucun compte désigné, l'appareil propose les siennes. */
export async function passkeyLoginOptions(db: Db, rp: RelyingParty, nowIso: string): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; token: string }> {
  const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: "required" });
  const token = issueToken(db, { userId: null, kind: "WEBAUTHN", ttlMs: CHALLENGE_MINUTES * 60_000, data: { challenge: options.challenge, purpose: "login" } }, nowIso);
  return { options, token };
}

export type PasskeyLogin = { ok: true; userId: number } | { ok: false; error: string; unverifiedUserId?: number };

/** Vérifie la signature de l'appareil pour un défi donné ; renvoie la passkey utilisée, ou null. */
async function verifyAssertion(db: Db, response: AuthenticationResponseJSON, challenge: string, rp: RelyingParty, nowIso: string) {
  const key = db.select().from(passkey).where(eq(passkey.id, String(response.id ?? ""))).get();
  if (!key) return null;
  let verified;
  try {
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: { id: key.id, publicKey: fromBase64Url(key.publicKey), counter: key.counter, transports: (key.transports ?? undefined) as never },
      requireUserVerification: true,
    });
  } catch {
    return null;
  }
  if (!verified.verified) return null;
  db.update(passkey).set({ counter: verified.authenticationInfo.newCounter, lastUsedAt: nowIso }).where(eq(passkey.id, key.id)).run();
  return key;
}

/** Vérifie la réponse de l'appareil ; renvoie le compte à connecter. */
export async function finishPasskeyLogin(
  db: Db,
  token: string | undefined,
  response: AuthenticationResponseJSON,
  rp: RelyingParty,
  options: { nowIso: string; mailEnabled: boolean },
): Promise<PasskeyLogin> {
  const refused = { ok: false as const, error: "Passkey non reconnue." };
  const row = consumeToken(db, "WEBAUTHN", token, options.nowIso);
  if (!row || row.data?.purpose !== "login") return { ok: false, error: "Demande expirée : recommencez." };
  const key = await verifyAssertion(db, response, String(row.data.challenge), rp, options.nowIso);
  if (!key) return refused;
  const user = db.select().from(appUser).where(eq(appUser.id, key.userId)).get();
  if (!user || user.disabledAt) return refused;
  if (options.mailEnabled && user.email && !user.emailVerifiedAt) return { ok: false, error: "Confirmez d'abord votre adresse : un nouveau lien vous a été envoyé.", unverifiedUserId: user.id };
  return { ok: true, userId: user.id };
}

/** Confirmation d'identité avant une action sensible : seules les passkeys du compte sont proposées. */
export async function passkeyConfirmOptions(db: Db, userId: number, rp: RelyingParty, nowIso: string): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; token: string }> {
  const keys = db.select({ id: passkey.id, transports: passkey.transports }).from(passkey).where(eq(passkey.userId, userId)).all();
  if (keys.length === 0) throw new UserError("Aucune passkey sur ce compte : confirmez avec votre mot de passe.");
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "required",
    allowCredentials: keys.map((k) => ({ id: k.id, transports: (k.transports ?? undefined) as never })),
  });
  const token = issueToken(db, { userId, kind: "WEBAUTHN", ttlMs: CHALLENGE_MINUTES * 60_000, data: { challenge: options.challenge, purpose: "confirm" } }, nowIso);
  return { options, token };
}

/** Vrai si l'appareil a signé le défi avec une passkey de ce compte. */
export async function finishPasskeyConfirm(db: Db, userId: number, token: string | undefined, response: AuthenticationResponseJSON, rp: RelyingParty, nowIso: string): Promise<boolean> {
  const row = consumeToken(db, "WEBAUTHN", token, nowIso);
  if (!row || row.userId !== userId || row.data?.purpose !== "confirm") return false;
  const key = await verifyAssertion(db, response, String(row.data.challenge), rp, nowIso);
  return key !== null && key.userId === userId;
}

/** Retire une passkey ; l'administrateur garde toujours au moins un second facteur. */
export function removePasskey(db: Db, userId: number, id: string, password: string, nowIso: string) {
  requirePassword(db, userId, password, nowIso);
  const user = db.select().from(appUser).where(eq(appUser.id, userId)).get();
  const keys = db.select({ n: count() }).from(passkey).where(eq(passkey.userId, userId)).get()!.n;
  if (user?.role === "ADMIN" && !user.totpEnabledAt && keys <= 1) throw new UserError("L'administrateur doit garder un second facteur : activez d'abord le double facteur.");
  const res = db.delete(passkey).where(and(eq(passkey.id, id), eq(passkey.userId, userId))).run();
  if (res.changes !== 1) throw new UserError("Passkey introuvable.");
  audit(db, userId, "PASSKEY_REMOVED", { nowIso });
}
