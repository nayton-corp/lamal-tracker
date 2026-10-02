/**
 * Redistribution de la taxe CO2 et de la taxe COV à la population (Office fédéral de
 * l'environnement, OFEV/BAFU), déduite des factures de caisse-maladie : montant annuel par
 * personne assurée. Publié chaque fin d'été pour l'année suivante.
 */
export const CO2_PAGE_URL = "https://www.bafu.admin.ch/de/co2-abgabe-private";

/**
 * Montants annoncés sur une page ou un mémento de l'OFEV : « im Jahr 2025 CHF 61.80 »,
 * « Jahr 2027 Fr. 57.– », « en 2026, 61.80 francs ». Les montants hors bornes plausibles
 * (10 à 200 CHF) sont ignorés.
 */
export function scanCo2Amounts(text: string): Map<number, number> {
  const found = new Map<number, number>();
  const plain = text.replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  const re = /(?:Jahr|année|anno|en)\s+(20\d{2})\D{0,25}?(?:CHF|Fr\.|Franken)\s*(\d{2,3})(?:[.,](\d{2}|[–-]))?/gi;
  for (const m of plain.matchAll(re)) {
    const year = Number(m[1]);
    const cents = m[3] && /^\d{2}$/.test(m[3]) ? Number(m[3]) : 0;
    const rp = Number(m[2]) * 100 + cents;
    if (rp >= 1000 && rp <= 20000 && !found.has(year)) found.set(year, rp);
  }
  return found;
}
