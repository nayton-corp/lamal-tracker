import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { closeSession, describeDevice, openSession, passwordToDefine, touchSession, type SessionInfo } from "@/application/auth";
import { UserError } from "@/application/errors";
import { requireAdmin as assertAdmin, scopeForUser, type Scope } from "@/application/scope";
import { db, nowIso } from "./context";

/*
 * La connexion est obligatoire : sans compte, tout mène à la création du premier ; sans session
 * valable, à la connexion. Le proxy fait ce contrôle pour chaque requête, et les pages et actions
 * serveur le refont elles-mêmes (`pageScope`, `requireScope`), pour ne pas dépendre du seul proxy.
 * Le foyer de chaque requête vient de la session, jamais d'un paramètre du navigateur.
 */
export const SESSION_COOKIE = "lamal_session";

export async function currentSession(): Promise<SessionInfo | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return touchSession(db(), token, nowIso());
}

/** Compte et foyer de la requête en cours (une seule lecture par requête). */
export const currentScope = cache(async (): Promise<(Scope & { sessionId: string }) | null> => {
  const s = await currentSession();
  if (!s) return null;
  const scope = scopeForUser(db(), s.userId);
  return scope ? { ...scope, sessionId: s.id } : null;
});

/** À appeler au début de chaque action serveur : refuse tout appel sans session ouverte. */
export async function requireScope(): Promise<Scope & { sessionId: string }> {
  const scope = await currentScope();
  if (!scope) throw new UserError("Session expirée : reconnectez-vous.");
  return scope;
}

/** Actions qui touchent le référentiel partagé (primes, caisses) ou toute la base. */
export async function requireAdminScope(): Promise<Scope & { sessionId: string }> {
  const scope = await requireScope();
  assertAdmin(scope);
  return scope;
}

/** Pour les pages : sans session, retour à la connexion. */
export async function pageScope(): Promise<Scope & { sessionId: string }> {
  const scope = await currentScope();
  if (!scope) redirect("/login");
  return scope;
}

export async function startSession(userId: number) {
  const h = await headers();
  const { token, expiresAt } = openSession(db(), userId, describeDevice(h.get("user-agent")), nowIso());
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

export function accountExists(): boolean {
  return !passwordToDefine(db());
}

/** Chemin de retour après connexion : seulement un chemin local. */
export function safeNext(next: unknown): string {
  const s = String(next ?? "");
  return /^\/(?![/\\])/.test(s) ? s : "/";
}
