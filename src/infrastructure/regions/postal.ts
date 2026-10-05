import data from "./postal-regions.json";

/*
 * Code postal → communes, canton et région de primes (fichier embarqué, OFSP et swisstopo), pour
 * proposer la bonne région de primes à la saisie de l'adresse du foyer.
 */

/** [code postal, localité, commune, n° OFS, canton, région, part des adresses du code postal en %] */
type Row = [string, string, string, number, string, number, number];

export interface CommuneOption {
  commune: string;
  bfs: number;
  canton: string;
  region: number;
  localities: string[];
  /** Part des adresses de ce code postal situées dans la commune (%). */
  share: number;
}

const rows = (data as unknown as { rows: Row[] }).rows;
/** Date de validité des régions de primes du fichier embarqué (ex. « 1.1.2027 »). */
export const REGIONS_VALID_FROM = (data as { validFrom: string }).validFrom;

/**
 * Communes (et leur région de primes) desservies par un code postal, de la plus probable à la
 * moins probable. Un code postal peut couvrir plusieurs communes, parfois de régions différentes.
 */
export function lookupPostalCode(npa: string): CommuneOption[] {
  const code = npa.trim();
  if (!/^\d{4}$/.test(code)) return [];
  const byCommune = new Map<number, CommuneOption>();
  for (const [plz, locality, commune, bfs, canton, region, share] of rows) {
    if (plz !== code) continue;
    const o = byCommune.get(bfs) ?? { commune, bfs, canton, region, localities: [], share: 0 };
    if (!o.localities.includes(locality)) o.localities.push(locality);
    o.share = Math.max(o.share, share);
    byCommune.set(bfs, o);
  }
  return [...byCommune.values()].sort((a, b) => b.share - a.share || a.commune.localeCompare(b.commune, "fr"));
}
