import { eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { person, signature } from "@/infrastructure/db/schema";
import { UserError } from "./errors";
import { ownedPerson, type Scope } from "./scope";

const MAX_BYTES = 300_000;

/** Enregistre (ou remplace) la signature dessinée d'une personne : image PNG en data URL. */
export function saveSignature(db: Db, scope: Scope, personId: number, dataUrl: string) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new UserError("Signature illisible : recommencez.");
  if (dataUrl.length > MAX_BYTES) throw new UserError("Signature trop lourde : recommencez avec un trait plus simple.");
  ownedPerson(db, scope, personId);
  db.insert(signature).values({ personId, dataUrl }).onConflictDoUpdate({ target: signature.personId, set: { dataUrl, createdAt: new Date().toISOString() } }).run();
}

export function deleteSignature(db: Db, scope: Scope, personId: number) {
  ownedPerson(db, scope, personId);
  db.delete(signature).where(eq(signature.personId, personId)).run();
}

/** Personnes du foyer avec leur signature éventuelle. */
export function listSignatures(db: Db, scope: Scope) {
  if (scope.householdId === null) return [];
  return db
    .select({ personId: person.id, firstName: person.firstName, lastName: person.lastName, birthDate: person.birthDate, dataUrl: signature.dataUrl, signedAt: signature.createdAt })
    .from(person)
    .leftJoin(signature, eq(signature.personId, person.id))
    .where(eq(person.householdId, scope.householdId))
    .all();
}

/** Signatures par nom complet, tel qu'il figure sous les lignes de signature des courriers. */
export function signaturesByName(db: Db, scope: Scope): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of listSignatures(db, scope)) if (s.dataUrl) out[`${s.firstName} ${s.lastName}`] = s.dataUrl;
  return out;
}
