import { and, asc, eq, max } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { appUser, householdMember, householdSetting, passkey, session } from "@/infrastructure/db/schema";
import { audit } from "./audit";
import { closeAllSessions } from "./auth";
import { NotFoundError, UserError } from "./errors";
import { requireAdmin, type Scope } from "./scope";

/*
 * Administration de l'instance. L'administrateur voit les comptes (courriel, facteurs, dernière
 * activité), jamais le contenu des foyers : ni personnes, ni contrats, ni montants.
 */

export interface AccountRow {
  id: number;
  email: string | null;
  admin: boolean;
  createdAt: string;
  emailVerified: boolean;
  totp: boolean;
  passkeys: number;
  disabled: boolean;
  householdId: number | null;
  householdRole: "OWNER" | "MEMBER" | null;
  lastSeenAt: string | null;
  pingen: boolean;
}

export function listAccounts(db: Db, scope: Scope): AccountRow[] {
  requireAdmin(scope);
  const users = db.select().from(appUser).orderBy(asc(appUser.id)).all();
  const members = new Map(db.select().from(householdMember).all().map((m) => [m.userId, m]));
  const seen = new Map(db.select({ userId: session.userId, last: max(session.lastSeenAt) }).from(session).groupBy(session.userId).all().map((r) => [r.userId, r.last]));
  const keys = new Map<number, number>();
  for (const k of db.select({ userId: passkey.userId }).from(passkey).all()) keys.set(k.userId, (keys.get(k.userId) ?? 0) + 1);
  const pingen = new Set(
    db.select({ householdId: householdSetting.householdId, value: householdSetting.value }).from(householdSetting).where(eq(householdSetting.key, PINGEN_KEY)).all()
      .filter((r) => r.value === true)
      .map((r) => r.householdId),
  );
  return users.map((u) => {
    const m = members.get(u.id);
    return {
      id: u.id,
      email: u.email,
      admin: u.role === "ADMIN",
      createdAt: u.createdAt,
      emailVerified: Boolean(u.emailVerifiedAt),
      totp: Boolean(u.totpEnabledAt),
      passkeys: keys.get(u.id) ?? 0,
      disabled: Boolean(u.disabledAt),
      householdId: m?.householdId ?? null,
      householdRole: m?.role ?? null,
      lastSeenAt: seen.get(u.id) ?? null,
      pingen: m ? pingen.has(m.householdId) : false,
    };
  });
}

/** Suspend (ou réactive) un compte : ses sessions sont fermées, il ne peut plus se connecter. */
export function setAccountDisabled(db: Db, scope: Scope, userId: number, disabled: boolean, nowIso: string) {
  requireAdmin(scope);
  if (userId === scope.userId) throw new UserError("Vous ne pouvez pas suspendre votre propre compte.");
  const user = db.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, userId)).get();
  if (!user) throw new NotFoundError("Compte");
  db.update(appUser).set({ disabledAt: disabled ? nowIso : null }).where(eq(appUser.id, userId)).run();
  if (disabled) closeAllSessions(db, userId);
  audit(db, userId, disabled ? "ACCOUNT_DISABLED" : "ACCOUNT_ENABLED", { nowIso });
}

// ───────────────────────── Pingen par foyer ─────────────────────────

const PINGEN_KEY = "pingen.enabled";

/**
 * L'envoi Pingen est facturé à l'exploitant : il n'est ouvert qu'aux foyers que l'administrateur
 * active un par un (le sien, en principe).
 */
export function pingenAllowed(db: Db, scope: Scope): boolean {
  if (scope.householdId === null) return false;
  const row = db
    .select({ value: householdSetting.value })
    .from(householdSetting)
    .where(and(eq(householdSetting.householdId, scope.householdId), eq(householdSetting.key, PINGEN_KEY)))
    .get();
  return row?.value === true;
}

export function setPingenAllowed(db: Db, scope: Scope, householdId: number, allowed: boolean) {
  requireAdmin(scope);
  const exists = db.select({ id: householdMember.householdId }).from(householdMember).where(eq(householdMember.householdId, householdId)).limit(1).get();
  if (!exists) throw new NotFoundError("Foyer");
  db.insert(householdSetting)
    .values({ householdId, key: PINGEN_KEY, value: allowed })
    .onConflictDoUpdate({ target: [householdSetting.householdId, householdSetting.key], set: { value: allowed } })
    .run();
}
