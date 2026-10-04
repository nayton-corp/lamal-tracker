import { appUser, household } from "@/infrastructure/db/schema";
import type { Db } from "@/infrastructure/db/client";
import { createHouseholdFor, withHousehold, type Scope } from "@/application/scope";

/** Compte de test sans mot de passe utilisable (hachage factice), sans foyer. */
export function testAccount(db: Db, role: "ADMIN" | "USER" = "USER"): Scope {
  const id = db.insert(appUser).values({ password: { salt: "", hash: "", cost: 2 }, role }).returning().get().id;
  return { userId: id, householdId: null, householdRole: null, admin: role === "ADMIN" };
}

/** Compte de test propriétaire d'un nouveau foyer. */
export function testHousehold(db: Db, values: Partial<typeof household.$inferInsert> = {}): Scope {
  const scope = testAccount(db);
  const id = createHouseholdFor(db, scope, { name: "Test", street: "Rue du Test 1", postalCode: "1000", city: "Lausanne", canton: "VD", region: 1, ...values });
  return withHousehold(scope, id);
}
