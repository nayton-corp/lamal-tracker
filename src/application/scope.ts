import { and, eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { appUser, household, householdMember, lamalPolicy, lcaPolicy, letter, offerRequest, person, review, reviewLine } from "@/infrastructure/db/schema";
import { NotFoundError, UserError } from "./errors";

/*
 * Cloisonnement des foyers. Chaque cas d'usage reçoit un `Scope`, construit côté serveur à partir
 * de la session (jamais d'un paramètre envoyé par le navigateur). Tout objet désigné par son
 * identifiant passe par un `owned*` : un objet d'un autre foyer est « introuvable ».
 */

export interface Scope {
  userId: number;
  /** Foyer du compte ; null tant que l'accueil ne l'a pas créé. */
  householdId: number | null;
  /** Propriétaire (tout, y compris inviter et supprimer) ou membre (consulter, préparer, signer). */
  householdRole: "OWNER" | "MEMBER" | null;
  isAdmin: boolean;
}

/** Portée d'un compte : son foyer et son rôle. Null si le compte n'existe plus ou est suspendu. */
export function scopeForUser(db: Db, userId: number): Scope | null {
  const user = db.select({ id: appUser.id, role: appUser.role, disabledAt: appUser.disabledAt }).from(appUser).where(eq(appUser.id, userId)).get();
  if (!user || user.disabledAt) return null;
  const member = db.select({ householdId: householdMember.householdId, role: householdMember.role }).from(householdMember).where(eq(householdMember.userId, userId)).get();
  return { userId: user.id, householdId: member?.householdId ?? null, householdRole: member?.role ?? null, isAdmin: user.role === "ADMIN" };
}

/** Le même compte, propriétaire du foyer qu'il vient de créer. */
export function withHousehold(scope: Scope, householdId: number): Scope {
  return { ...scope, householdId, householdRole: "OWNER" };
}

/** Identifiant du foyer, ou une erreur lisible si l'accueil n'est pas fait. */
export function householdIdOf(scope: Scope): number {
  if (scope.householdId === null) throw new UserError("Configurez d'abord le foyer.");
  return scope.householdId;
}

export function requireAdmin(scope: Scope) {
  if (!scope.isAdmin) throw new UserError("Réservé à l'administrateur.");
}

/** Inviter, retirer un membre, tout effacer : réservé au propriétaire du foyer. */
export function requireOwner(scope: Scope) {
  householdIdOf(scope);
  if (scope.householdRole !== "OWNER") throw new UserError("Réservé au propriétaire du foyer.");
}

/** Crée le foyer d'un compte qui n'en a pas encore, et l'en rend propriétaire. */
export function createHouseholdFor(db: Db, scope: Scope, values: typeof household.$inferInsert): number {
  if (scope.householdId !== null) throw new UserError("Un foyer existe déjà.");
  return db.transaction((tx) => {
    const id = tx.insert(household).values(values).returning().get().id;
    tx.insert(householdMember).values({ householdId: id, userId: scope.userId, role: "OWNER" }).run();
    return id;
  });
}

// ───────────────────────── Propriété des objets ─────────────────────────

const householdIdOrNone = (scope: Scope) => scope.householdId ?? -1;

export function findPerson(db: Db, scope: Scope, personId: number) {
  return db.select().from(person).where(and(eq(person.id, personId), eq(person.householdId, householdIdOrNone(scope)))).get() ?? null;
}

export function ownedPerson(db: Db, scope: Scope, personId: number) {
  const row = findPerson(db, scope, personId);
  if (!row) throw new NotFoundError("Personne");
  return row;
}

export function findReview(db: Db, scope: Scope, reviewId: number) {
  return db.select().from(review).where(and(eq(review.id, reviewId), eq(review.householdId, householdIdOrNone(scope)))).get() ?? null;
}

export function ownedReview(db: Db, scope: Scope, reviewId: number) {
  const row = findReview(db, scope, reviewId);
  if (!row) throw new NotFoundError("Rituel");
  return row;
}

export function findLine(db: Db, scope: Scope, lineId: number) {
  return (
    db
      .select({ line: reviewLine })
      .from(reviewLine)
      .innerJoin(review, eq(review.id, reviewLine.reviewId))
      .where(and(eq(reviewLine.id, lineId), eq(review.householdId, householdIdOrNone(scope))))
      .get()?.line ?? null
  );
}

export function ownedLine(db: Db, scope: Scope, lineId: number) {
  const row = findLine(db, scope, lineId);
  if (!row) throw new NotFoundError("Ligne");
  return row;
}

export function findLetter(db: Db, scope: Scope, letterId: number) {
  return (
    db
      .select({ letter })
      .from(letter)
      .innerJoin(review, eq(review.id, letter.reviewId))
      .where(and(eq(letter.id, letterId), eq(review.householdId, householdIdOrNone(scope))))
      .get()?.letter ?? null
  );
}

export function ownedLetter(db: Db, scope: Scope, letterId: number) {
  const row = findLetter(db, scope, letterId);
  if (!row) throw new NotFoundError("Lettre");
  return row;
}

export function findOfferRequest(db: Db, scope: Scope, id: number) {
  return (
    db
      .select({ request: offerRequest })
      .from(offerRequest)
      .innerJoin(review, eq(review.id, offerRequest.reviewId))
      .where(and(eq(offerRequest.id, id), eq(review.householdId, householdIdOrNone(scope))))
      .get()?.request ?? null
  );
}

export function ownedOfferRequest(db: Db, scope: Scope, id: number) {
  const row = findOfferRequest(db, scope, id);
  if (!row) throw new NotFoundError("Demande");
  return row;
}

export function ownedPolicy(db: Db, scope: Scope, policyId: number) {
  const row = db
    .select({ policy: lamalPolicy })
    .from(lamalPolicy)
    .innerJoin(person, eq(person.id, lamalPolicy.personId))
    .where(and(eq(lamalPolicy.id, policyId), eq(person.householdId, householdIdOrNone(scope))))
    .get();
  if (!row) throw new NotFoundError("Contrat");
  return row.policy;
}

export function ownedLca(db: Db, scope: Scope, lcaId: number) {
  const row = db
    .select({ lca: lcaPolicy })
    .from(lcaPolicy)
    .innerJoin(person, eq(person.id, lcaPolicy.personId))
    .where(and(eq(lcaPolicy.id, lcaId), eq(person.householdId, householdIdOrNone(scope))))
    .get();
  if (!row) throw new NotFoundError("Complémentaire");
  return row.lca;
}
