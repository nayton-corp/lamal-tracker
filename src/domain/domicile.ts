/*
 * Domicile au 1er janvier d'une année : la commune (canton et région de primes) qui fixe les primes
 * de cette année. Chaque contrat garde le sien, et chaque ligne de bilan celui de l'année cible :
 * un foyer qui déménage d'un canton à l'autre garde ainsi un historique juste.
 */

export interface Domicile {
  /** Nom de la commune ; vide si la région a été indiquée à la main. */
  commune: string;
  /** Numéro OFS de la commune ; null si inconnu. */
  bfsNumber: number | null;
  canton: string;
  /** Région de primes du canton (0 à 3). */
  region: number;
}

/** Même région de primes : les primes sont les mêmes, la commune peut différer. */
export function samePremiumRegion(a: Domicile, b: Domicile): boolean {
  return a.canton === b.canton && a.region === b.region;
}

/** Même domicile (commune comprise), pour savoir si une ligne suivait encore l'adresse du foyer. */
export function sameDomicile(a: Domicile, b: Domicile): boolean {
  return samePremiumRegion(a, b) && a.commune === b.commune && (a.bfsNumber ?? null) === (b.bfsNumber ?? null);
}

/** « Sion (VS) », ou « VS, région 1 » quand la commune n'est pas connue. */
export function domicileLabel(d: Domicile): string {
  return d.commune ? `${d.commune} (${d.canton})` : `${d.canton}, région ${d.region}`;
}

/** Les quatre champs d'une ligne qui porte un domicile (contrat, ligne de bilan, foyer). */
export function domicileOf(row: { commune: string; bfsNumber: number | null; canton: string; region: number }): Domicile {
  return { commune: row.commune, bfsNumber: row.bfsNumber, canton: row.canton, region: row.region };
}
