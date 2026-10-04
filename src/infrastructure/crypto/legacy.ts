import { eq, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { appUser, person, signature } from "../db/schema";
import { isSealed, sealForHousehold, sealSecret } from "./vault";

/** Contextes authentifiés des valeurs chiffrées (une valeur ne s'ouvre qu'à sa place). */
export const signatureContext = (personId: number) => `signature:${personId}`;
export const totpContext = (userId: number) => `totp:${userId}`;

/**
 * Au démarrage : chiffre ce qui a été enregistré en clair avant le chiffrement (signatures,
 * secrets du double facteur). Chaque valeur est réécrite à part : une reprise après coupure finit
 * le travail. Sans effet une fois fait. Renvoie le nombre de valeurs chiffrées.
 */
export function sealLegacyData(db: Db): number {
  let sealed = 0;
  const signatures = db
    .select({ personId: signature.personId, dataUrl: signature.dataUrl, householdId: person.householdId })
    .from(signature)
    .innerJoin(person, eq(person.id, signature.personId))
    .all();
  for (const s of signatures) {
    if (isSealed(s.dataUrl)) continue;
    db.update(signature).set({ dataUrl: sealForHousehold(db, s.householdId, s.dataUrl, signatureContext(s.personId)) }).where(eq(signature.personId, s.personId)).run();
    sealed++;
  }
  for (const u of db.select({ id: appUser.id, secret: appUser.totpSecret }).from(appUser).where(isNotNull(appUser.totpSecret)).all()) {
    if (isSealed(u.secret!)) continue;
    db.update(appUser).set({ totpSecret: sealSecret(db, u.secret!, totpContext(u.id)) }).where(eq(appUser.id, u.id)).run();
    sealed++;
  }
  return sealed;
}
