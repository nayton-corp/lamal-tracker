import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
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

/**
 * Code d'installation (SETUP_TOKEN) : exigé pour créer le compte administrateur ou redéfinir son
 * mot de passe, tant qu'un serveur exposé attend sa première connexion. Null s'il n'est pas défini.
 */
export function setupToken(): string | null {
  return process.env.SETUP_TOKEN?.trim() || null;
}

/**
 * Instance publiée en HTTPS : le code d'installation y est obligatoire, sinon le premier venu
 * créerait le compte administrateur (ou redéfinirait son mot de passe après un oubli).
 */
export function setupTokenMissing(): boolean {
  return setupToken() === null && (process.env.APP_URL?.trim().startsWith("https://") ?? false);
}

/** Saisie conforme au code d'installation (comparaison à temps constant) ; sans code, vrai sur une instance locale. */
export function setupCodeMatches(input: FormDataEntryValue | null): boolean {
  const expected = setupToken();
  if (expected === null) return !setupTokenMissing();
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(String(input ?? "").trim()), digest(expected));
}

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
 * Adresse IP du client, pour les limites de débit. Next ne pose X-Forwarded-For que s'il manque :
 * sans mandataire devant l'app, l'en-tête vient du client et ne prouve rien, d'où une clé unique.
 * Chaque mandataire de confiance (TRUSTED_PROXY_HOPS, 1 derrière Caddy, qui écrase l'en-tête
 * reçu) ajoute une entrée à droite : on prend celle du plus éloigné d'entre eux. Une adresse IPv6
 * est ramenée à son préfixe /64, que le client contrôle en entier.
 */
export function clientIpFrom(forwarded: string, hops: number): string {
  if (hops <= 0) return "directe";
  const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
  const ip = parts[parts.length - hops];
  if (!ip) return "inconnue";
  return ip.includes(":") ? ipv6Prefix(ip) : ip;
}

function ipv6Prefix(ip: string): string {
  const [head, tail = ""] = ip.toLowerCase().replace(/^\[|\]$/g, "").split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export async function clientIp(): Promise<string> {
  const hops = Math.max(0, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? 0)) || 0);
  return clientIpFrom((await headers()).get("x-forwarded-for") ?? "", hops);
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
  // En HTTPS, seul le cookie préfixé compte : un cookie simple a pu être posé par un sous-domaine.
  const names = (await isSecureRequest()) ? [`__Host-${name}`] : cookieNames(name);
  for (const n of names) {
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
