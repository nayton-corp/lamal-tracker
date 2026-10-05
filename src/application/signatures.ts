import { eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { person, signature } from "@/infrastructure/db/schema";
import { signatureContext } from "@/infrastructure/crypto/legacy";
import { openForHousehold, sealForHousehold } from "@/infrastructure/crypto/vault";
import { UserError } from "./errors";
import { ownedPerson, type Scope } from "./scope";

/*
 * Signatures dessinées des personnes du foyer : chiffrées en base par la clé du foyer, apposées sur
 * les courriers au rendu PDF (et exigées pour l'envoi par Pingen).
 */

const MAX_BYTES = 300_000;

/**
 * Enregistre (ou remplace) la signature dessinée d'une personne : image PNG en data URL, chiffrée
 * par la clé du foyer avant d'entrer en base.
 */
export function saveSignature(db: Db, scope: Scope, personId: number, dataUrl: string) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new UserError("Signature illisible : recommencez.");
  if (dataUrl.length > MAX_BYTES) throw new UserError("Signature trop lourde : recommencez avec un trait plus simple.");
  const personRow = ownedPerson(db, scope, personId);
  const sealed = sealForHousehold(db, personRow.householdId, dataUrl, signatureContext(personId));
  db.insert(signature).values({ personId, dataUrl: sealed }).onConflictDoUpdate({ target: signature.personId, set: { dataUrl: sealed, createdAt: new Date().toISOString() } }).run();
}

export function deleteSignature(db: Db, scope: Scope, personId: number) {
  ownedPerson(db, scope, personId);
  db.delete(signature).where(eq(signature.personId, personId)).run();
}

/**
 * Personnes du foyer avec leur signature éventuelle, déchiffrée. Une signature illisible (clé
 * maître perdue ou changée) compte comme absente : il suffit de signer à nouveau.
 */
export function listSignatures(db: Db, scope: Scope) {
  const householdId = scope.householdId;
  if (householdId === null) return [];
  return db
    .select({ personId: person.id, firstName: person.firstName, lastName: person.lastName, birthDate: person.birthDate, sealed: signature.dataUrl, signedAt: signature.createdAt })
    .from(person)
    .leftJoin(signature, eq(signature.personId, person.id))
    .where(eq(person.householdId, householdId))
    .all()
    .map(({ sealed, ...row }) => {
      const dataUrl = sealed ? openForHousehold(db, householdId, sealed, signatureContext(row.personId)) : null;
      return { ...row, dataUrl, signedAt: dataUrl ? row.signedAt : null };
    });
}

/** Signatures par nom complet, tel qu'il figure sous les lignes de signature des courriers. */
export function signaturesByName(db: Db, scope: Scope): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of listSignatures(db, scope)) if (s.dataUrl) out[`${s.firstName} ${s.lastName}`] = s.dataUrl;
  return out;
}
