import "server-only";
import { cookies, headers } from "next/headers";
import type { MailDeps } from "@/application/account-mail";
import type { AccountDeps } from "@/application/account";
import { UserError } from "@/application/errors";
import type { RelyingParty } from "@/application/passkeys";
import { pwnedCount } from "@/infrastructure/hibp";
import { mailerFromEnv, type Mailer } from "@/infrastructure/mail/mailer";
import { consume } from "@/infrastructure/rate-limit";

/*
 * Ce dont les comptes ont besoin côté serveur : envoi de courriels, adresse publique, adresse IP
 * du client (limitation de débit), site WebAuthn et cookies.
 */

const globalForMail = globalThis as unknown as { __mailer?: { key: string; mailer: Mailer | null } };

/** Adresse publique de l'app (APP_URL), sans barre finale ; null si elle n'est pas configurée. */
export function appUrl(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Envoi de courriels : il faut un transport (SMTP_URL ou MAIL_DIR) ET l'adresse publique, sans
 * laquelle les liens ne peuvent pas être construits de façon sûre (jamais à partir de l'en-tête Host).
 */
export function mailDeps(): MailDeps | null {
  const url = appUrl();
  const key = `${process.env.SMTP_URL ?? ""}|${process.env.MAIL_DIR ?? ""}|${process.env.MAIL_FROM ?? ""}`;
  if (globalForMail.__mailer?.key !== key) globalForMail.__mailer = { key, mailer: mailerFromEnv() };
  const mailer = globalForMail.__mailer.mailer;
  return mailer && url ? { mailer, appUrl: url } : null;
}

export function accountDeps(): AccountDeps {
  return { mail: mailDeps(), pwned: (password) => pwnedCount(password) };
}

/**
 * Adresse IP du client. Next ajoute l'adresse de la connexion à la fin de X-Forwarded-For ; chaque
 * mandataire de confiance devant l'app (TRUSTED_PROXY_HOPS, 1 derrière Caddy) en ajoute une. On
 * prend l'entrée posée par le dernier mandataire de confiance : les précédentes sont falsifiables.
 */
export async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
  const hops = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 0) || 0);
  return parts[Math.max(0, parts.length - 1 - hops)] ?? "inconnue";
}

const TOO_MANY = "Trop de tentatives : réessayez dans quelques minutes.";

/** Limite de débit : refuse au-delà de `limit` essais par fenêtre, pour chaque clé donnée. */
export function rateLimit(keys: string[], limit: number, windowMinutes: number) {
  for (const key of keys) if (!consume(key, limit, windowMinutes * 60_000)) throw new UserError(TOO_MANY);
}

/** Origine de la requête : celle d'APP_URL si elle est configurée, sinon celle vue par le serveur. */
export async function requestOrigin(): Promise<string> {
  const configured = appUrl();
  if (configured) return configured;
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${proto}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost"}`;
}

/** Site WebAuthn : le nom de domaine de l'app. Les passkeys exigent HTTPS (ou localhost). */
export async function relyingParty(): Promise<RelyingParty> {
  const origin = await requestOrigin();
  return { id: new URL(origin).hostname, name: "Primes LAMal", origin };
}

// ───────────────────────── Cookies ─────────────────────────

export async function isSecureRequest(): Promise<boolean> {
  return ((await headers()).get("x-forwarded-proto") ?? "http").split(",")[0]!.trim() === "https";
}

/**
 * En HTTPS, les cookies portent le préfixe `__Host-` : le navigateur les refuse s'ils ne sont pas
 * sécurisés ou s'ils visent un autre chemin ou un sous-domaine. En HTTP (réseau local), nom simple.
 */
export const cookieNames = (name: string) => [`__Host-${name}`, name];

export async function readCookie(name: string): Promise<string | undefined> {
  const jar = await cookies();
  for (const n of cookieNames(name)) {
    const value = jar.get(n)?.value;
    if (value) return value;
  }
  return undefined;
}

export async function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  const secure = await isSecureRequest();
  (await cookies()).set(secure ? `__Host-${name}` : name, value, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: maxAgeSeconds });
}

export async function deleteCookie(name: string) {
  const jar = await cookies();
  for (const n of cookieNames(name)) {
    if (jar.get(n)) jar.set(n, "", { httpOnly: true, sameSite: "lax", secure: n.startsWith("__Host-"), path: "/", maxAge: 0 });
  }
}
