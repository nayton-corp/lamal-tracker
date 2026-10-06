import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { domicileOf, sameDomicile } from "@/domain/domicile";
import type { Db } from "@/infrastructure/db/client";
import { lamalPolicy, person, review } from "@/infrastructure/db/schema";
import { getHousehold, saveHousehold, type householdInput } from "./household";
import { setLineDomiciles } from "./review";
import { withHousehold, type Scope } from "./scope";

/*
 * Changement d'adresse du foyer. Chaque contrat garde le domicile de son année : un déménagement
 * ne touche que le bilan en cours (domicile au 1er janvier de l'année cible), une correction
 * (adresse mal saisie) reporte aussi la nouvelle commune sur les contrats qui avaient l'ancienne.
 */

/** MOVE : le foyer a déménagé ; CORRECTION : l'adresse enregistrée était fausse. */
export type AddressChange = "MOVE" | "CORRECTION";

/** Enregistre l'adresse du foyer (ou le crée) et en tire les conséquences ; renvoie l'id du foyer. */
export function saveHouseholdAddress(db: Db, scope: Scope, input: z.input<typeof householdInput>, change: AddressChange): number {
  const before = getHousehold(db, scope);
  return db.transaction(() => {
    const id = saveHousehold(db, scope, input);
    const mine = withHousehold(scope, id);
    const after = getHousehold(db, mine)!;
    if (!before || sameDomicile(domicileOf(before), domicileOf(after))) return id;
    const old = domicileOf(before);
    const now = domicileOf(after);
    if (change === "CORRECTION") {
      const personIds = db.select({ id: person.id }).from(person).where(eq(person.householdId, id)).all().map((p) => p.id);
      if (personIds.length) {
        const policies = db.select().from(lamalPolicy).where(inArray(lamalPolicy.personId, personIds)).all();
        for (const pol of policies.filter((p) => sameDomicile(domicileOf(p), old))) {
          db.update(lamalPolicy).set(now).where(eq(lamalPolicy.id, pol.id)).run();
        }
      }
    }
    // Bilan en cours : les personnes qui suivaient l'adresse du foyer la suivent encore.
    const open = db.select().from(review).where(and(eq(review.householdId, id), eq(review.status, "OPEN"))).all();
    for (const r of open) setLineDomiciles(db, mine, r.id, null, now, old);
    return id;
  });
}
