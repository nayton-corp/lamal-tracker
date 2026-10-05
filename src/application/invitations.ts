import { and, asc, count, desc, eq, gt, isNull, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/infrastructure/db/client";
import { appUser, household, householdMember, invitation } from "@/infrastructure/db/schema";
import { audit } from "./audit";
import { NotFoundError, UserError } from "./errors";
import { householdIdOf, requireAdmin, requireOwner, type Scope } from "./scope";
import { digest, randomToken } from "./tokens";

/*
 * Invitations. L'inscription n'est ouverte qu'avec un code :
 *  - SIGNUP : créé par l'administrateur, pour un nouveau foyer (une ou plusieurs utilisations) ;
 *  - HOUSEHOLD : créé par le propriétaire d'un foyer pour son conjoint (48 heures, une fois).
 * Le code n'est montré qu'à sa création ; la base n'en garde que l'empreinte.
 */

const HOUSEHOLD_INVITE_HOURS = 48;
export const MAX_HOUSEHOLD_MEMBERS = 6;

export type Invitation = typeof invitation.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const countWhere = (db: Db, table: typeof invitation | typeof householdMember, where: SQL | undefined) => db.select({ n: count() }).from(table).where(where).get()!.n;

const signupInput = z.object({
  label: z.string().trim().max(80).default(""),
  maxUses: z.coerce.number().int().min(1, "Au moins 1.").max(100, "Au plus 100."),
  days: z.coerce.number().int().min(1, "Au moins 1 jour.").max(60, "Au plus 60 jours."),
});

/** Invitation à créer un compte (et un nouveau foyer). Renvoie le code, à transmettre tel quel. */
export function createSignupInvitation(db: Db, scope: Scope, input: z.input<typeof signupInput>, nowIso: string): string {
  requireAdmin(scope);
  const data = signupInput.parse(input);
  const code = randomToken(18);
  db.insert(invitation)
    .values({
      kind: "SIGNUP",
      codeHash: digest(code),
      label: data.label,
      createdBy: scope.userId,
      maxUses: data.maxUses,
      expiresAt: new Date(Date.parse(nowIso) + data.days * 86_400_000).toISOString(),
      createdAt: nowIso,
    })
    .run();
  audit(db, scope.userId, "INVITE_CREATED", { detail: data.label, nowIso });
  return code;
}

export function listSignupInvitations(db: Db, scope: Scope) {
  requireAdmin(scope);
  return db
    .select({ id: invitation.id, label: invitation.label, maxUses: invitation.maxUses, uses: invitation.uses, expiresAt: invitation.expiresAt, revokedAt: invitation.revokedAt, createdAt: invitation.createdAt })
    .from(invitation)
    .where(eq(invitation.kind, "SIGNUP"))
    .orderBy(desc(invitation.createdAt))
    .all();
}

/** Invitation du conjoint : un lien à usage unique, valable 48 heures. */
export function createHouseholdInvitation(db: Db, scope: Scope, nowIso: string): string {
  requireOwner(scope);
  const householdId = householdIdOf(scope);
  const members = countWhere(db, householdMember, eq(householdMember.householdId, householdId));
  const pending = countWhere(db, invitation, and(eq(invitation.householdId, householdId), isNull(invitation.revokedAt), gt(invitation.expiresAt, nowIso), sql`${invitation.uses} < ${invitation.maxUses}`));
  if (members + pending >= MAX_HOUSEHOLD_MEMBERS) throw new UserError(`Un foyer compte au plus ${MAX_HOUSEHOLD_MEMBERS} comptes.`);
  const code = randomToken(18);
  db.insert(invitation)
    .values({
      kind: "HOUSEHOLD",
      codeHash: digest(code),
      createdBy: scope.userId,
      householdId,
      maxUses: 1,
      expiresAt: new Date(Date.parse(nowIso) + HOUSEHOLD_INVITE_HOURS * 3_600_000).toISOString(),
      createdAt: nowIso,
    })
    .run();
  audit(db, scope.userId, "INVITE_CREATED", { householdId, detail: "foyer", nowIso });
  return code;
}

/** Invitations du foyer encore utilisables. */
export function listHouseholdInvitations(db: Db, scope: Scope, nowIso: string) {
  const householdId = householdIdOf(scope);
  return db
    .select({ id: invitation.id, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt })
    .from(invitation)
    .where(and(eq(invitation.householdId, householdId), isNull(invitation.revokedAt), gt(invitation.expiresAt, nowIso), sql`${invitation.uses} < ${invitation.maxUses}`))
    .orderBy(asc(invitation.createdAt))
    .all();
}

/** Révocation : l'administrateur pour les inscriptions, le propriétaire pour son foyer. */
export function revokeInvitation(db: Db, scope: Scope, id: number, nowIso: string) {
  const row = db.select().from(invitation).where(eq(invitation.id, id)).get();
  const allowed = row && (row.kind === "SIGNUP" ? scope.admin : row.householdId === scope.householdId && scope.householdRole === "OWNER");
  if (!row || !allowed) throw new NotFoundError("Invitation");
  db.update(invitation).set({ revokedAt: nowIso }).where(eq(invitation.id, id)).run();
  audit(db, scope.userId, "INVITE_REVOKED", { householdId: row.householdId, nowIso });
}

/** Invitation utilisable pour ce code (ni expirée, ni révoquée, ni épuisée), ou null. */
export function findUsableInvitation(db: Db, code: string | null | undefined, nowIso: string): Invitation | null {
  const clean = String(code ?? "").trim();
  if (!clean || clean.length > 100) return null;
  const row = db.select().from(invitation).where(eq(invitation.codeHash, digest(clean))).get();
  if (!row || row.revokedAt || row.expiresAt <= nowIso || row.uses >= row.maxUses) return null;
  if (row.kind === "HOUSEHOLD" && row.householdId === null) return null;
  return row;
}

/** Ce que la page d'inscription peut dire d'une invitation, sans rien révéler du foyer. */
export function describeInvitation(db: Db, code: string | null | undefined, nowIso: string): { kind: "SIGNUP" | "HOUSEHOLD"; inviter: string | null } | null {
  const row = findUsableInvitation(db, code, nowIso);
  if (!row) return null;
  if (row.kind === "SIGNUP") return { kind: "SIGNUP", inviter: null };
  const inviter = row.createdBy === null ? null : (db.select({ email: appUser.email }).from(appUser).where(eq(appUser.id, row.createdBy)).get()?.email ?? null);
  return { kind: "HOUSEHOLD", inviter };
}

/**
 * Utilise une invitation dans la transaction de création du compte. Le compteur n'avance que si
 * l'invitation est encore utilisable à cet instant : deux inscriptions simultanées ne dépassent
 * jamais le nombre prévu.
 */
export function claimInvitation(tx: Tx, row: Invitation, nowIso: string) {
  const res = tx
    .update(invitation)
    .set({ uses: sql`${invitation.uses} + 1` })
    .where(and(eq(invitation.id, row.id), isNull(invitation.revokedAt), gt(invitation.expiresAt, nowIso), lt(invitation.uses, invitation.maxUses)))
    .run();
  if (res.changes !== 1) throw new UserError("Cette invitation n'est plus valable.");
  if (row.kind === "HOUSEHOLD") {
    const exists = tx.select({ id: household.id }).from(household).where(eq(household.id, row.householdId!)).get();
    if (!exists) throw new UserError("Cette invitation n'est plus valable.");
  }
}

// ───────────────────────── Membres du foyer ─────────────────────────

export function householdMembers(db: Db, scope: Scope) {
  const householdId = householdIdOf(scope);
  return db
    .select({ userId: householdMember.userId, role: householdMember.role, email: appUser.email, since: householdMember.createdAt })
    .from(householdMember)
    .innerJoin(appUser, eq(appUser.id, householdMember.userId))
    .where(eq(householdMember.householdId, householdId))
    // Propriétaire d'abord (« OWNER » > « MEMBER »), puis par ancienneté.
    .orderBy(desc(householdMember.role), asc(householdMember.createdAt), asc(householdMember.userId))
    .all()
    .map((m) => ({ ...m, you: m.userId === scope.userId }));
}

/** Le propriétaire retire un membre ; le compte reste, sans foyer. */
export function removeMember(db: Db, scope: Scope, userId: number, nowIso: string) {
  requireOwner(scope);
  const householdId = householdIdOf(scope);
  if (userId === scope.userId) throw new UserError("Le propriétaire ne peut pas se retirer lui-même.");
  const res = db.delete(householdMember).where(and(eq(householdMember.householdId, householdId), eq(householdMember.userId, userId))).run();
  if (res.changes !== 1) throw new NotFoundError("Membre");
  audit(db, scope.userId, "MEMBER_REMOVED", { householdId, nowIso });
  audit(db, userId, "MEMBER_REMOVED", { nowIso });
}

/** Un membre quitte le foyer ; il pourra en créer un à lui. */
export function leaveHousehold(db: Db, scope: Scope, nowIso: string) {
  const householdId = householdIdOf(scope);
  if (scope.householdRole === "OWNER") throw new UserError("Le propriétaire ne quitte pas son foyer : il peut le supprimer dans les réglages.");
  db.delete(householdMember).where(and(eq(householdMember.householdId, householdId), eq(householdMember.userId, scope.userId))).run();
  audit(db, scope.userId, "MEMBER_LEFT", { nowIso });
}
