import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mot de passe optionnel (APP_PASSWORD). Sans lui, l'app est ouverte à qui atteint le Pi :
 * acceptable sur un réseau domestique ou derrière Tailscale, pas exposée sur Internet.
 */
export const SESSION_COOKIE = "lamal_session";

export function passwordEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function secret(): string {
  return process.env.SESSION_SECRET || `lamal:${process.env.APP_PASSWORD ?? ""}`;
}

export function sessionToken(): string {
  return createHmac("sha256", secret()).update("session-v1").digest("base64url");
}

export function validSession(token: string | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(sessionToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkPassword(candidate: string): boolean {
  const expected = Buffer.from(process.env.APP_PASSWORD ?? "");
  const given = Buffer.from(candidate);
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}
