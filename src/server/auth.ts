import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { closeSession, describeDevice, hasPassword, openSession, touchSession, type SessionInfo } from "@/application/auth";
import { UserError } from "@/application/review";
import { db, nowIso } from "./context";

/*
 * Le mot de passe est obligatoire : sans mot de passe défini, tout mène à sa création ; sans
 * session valable, à la connexion. Le proxy fait ce contrôle pour chaque requête, et les
 * actions serveur le refont elles-mêmes (`requireSession`), pour ne pas dépendre du seul proxy.
 */
export const SESSION_COOKIE = "lamal_session";

export async function currentSession(): Promise<SessionInfo | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return touchSession(db(), token, nowIso());
}

/** À appeler au début de chaque action serveur : refuse tout appel sans session ouverte. */
export async function requireSession(): Promise<SessionInfo> {
  const s = await currentSession();
  if (!s) throw new UserError("Session expirée : reconnectez-vous.");
  return s;
}

export async function startSession() {
  const h = await headers();
  const { token, expiresAt } = openSession(db(), describeDevice(h.get("user-agent")), nowIso());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (h.get("x-forwarded-proto") ?? "http") === "https",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession() {
  const jar = await cookies();
  closeSession(db(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

/** Pages de connexion : inutiles quand on est déjà connecté. */
export async function redirectIfSignedIn(to = "/") {
  if (await currentSession()) redirect(to);
}

export function passwordDefined(): boolean {
  return hasPassword(db());
}

/** Chemin de retour après connexion : seulement un chemin local. */
export function safeNext(next: unknown): string {
  const s = String(next ?? "");
  return /^\/(?![/\\])/.test(s) ? s : "/";
}
