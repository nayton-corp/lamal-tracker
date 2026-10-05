import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { settings } from "./schema";

/*
 * Réglages globaux de l'instance (table `settings`, une valeur JSON par clé). Les réglages propres
 * à un foyer sont dans `household_setting` (application/household.ts).
 */
export const SETTING_KEYS = {
  /** Dernier contrôle des primes publiées par l'OFSP ({ at, url?, ok }). */
  ofspLastCheck: "ofsp.lastCheck",
  /** Empreinte du dernier fichier de primes importé (évite de retélécharger le même). */
  ofspSignature: "ofsp.signature",
  /** Clés VAPID des notifications push, créées au premier usage. */
  pushVapid: "push.vapid",
  /** Version du référentiel (caisses, CO2) fourni avec l'image. */
  referenceBundled: "reference.bundled",
  /** Référentiel mis à jour en ligne depuis (adresses des caisses, CO2). */
  referenceLocal: "reference.local",
  /** Dernière mise à jour en ligne du référentiel. */
  referenceLastCheck: "reference.lastCheck",
} as const;

/** Clé connue, ou date du dernier essai d'import d'une année (`ofsp.yearAttempt.AAAA`, voir ofsp/retry.ts). */
export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS] | `ofsp.yearAttempt.${number}`;

/** Valeur d'un réglage, ou null ; le type `T` n'est pas vérifié à la lecture. */
export function getSetting<T>(db: Db, key: SettingKey): T | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? (row.value as T) : null;
}

/** Crée ou remplace un réglage (valeur sérialisée en JSON). */
export function setSetting(db: Db, key: SettingKey, value: unknown) {
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}
