/**
 * Noms de tous les cookies de l'app, au même endroit. En HTTPS, `writeCookie` (server/accounts.ts)
 * les préfixe de `__Host-` : le navigateur refuse alors qu'un sous-domaine les pose ou les lise.
 * Ce module n'importe rien : `proxy.ts` (le middleware) peut aussi l'utiliser.
 */
export const COOKIE = {
  /** Session de connexion (jeton opaque, haché en base). */
  session: "lamal_session",
  /** Appareil connu : une connexion depuis un nouvel appareil déclenche un courriel d'alerte. */
  device: "lamal_device",
  /** Connexion en attente du second facteur (5 minutes). */
  mfa: "lamal_mfa",
  /** Mise en place du double facteur en cours (15 minutes). */
  totp: "lamal_totp",
  /** Défi WebAuthn (passkey) en cours (5 minutes). */
  webauthn: "lamal_wa",
  /** « Pour moi seul·e » ou « pour mon foyer », choisi avant que le foyer existe. */
  householdMode: "lamal_mode",
} as const;

/** Variantes possibles d'un nom de cookie : préfixé `__Host-` (HTTPS) d'abord, puis simple (HTTP local). */
export function cookieVariants(name: string): [string, string] {
  return [`__Host-${name}`, name];
}
