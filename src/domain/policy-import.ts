import type { IsoDate } from "./dates";
import type { LcaGuarantee } from "./lca";
import type { ModelType } from "./lamal";
import type { Rappen } from "./money";

/**
 * Lecture d'une police d'assurance (texte extrait du PDF). Chaque caisse a sa mise en page :
 * on ne dépend d'aucune, on cherche des indices robustes (dates de naissance des membres du
 * foyer, mots-clés en français, allemand et italien, montants) et on laisse l'application
 * confirmer le tarif en retrouvant la prime exacte dans les primes officielles.
 */

export interface ImportPerson {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: IsoDate;
}

export interface ImportInsurer {
  id: number;
  /** Noms connus : nom usuel, raisons sociales, groupe. */
  names: string[];
}

export interface PersonExtract {
  personId: number;
  policyNumber: string | null;
  franchiseChf: number | null;
  accident: boolean | null;
  modelType: ModelType | null;
  /** Tous les montants lus dans la partie de la police qui concerne la personne. */
  amountsRp: Rappen[];
  lca: { guarantee: LcaGuarantee; monthlyRp: Rappen | null }[];
}

export interface PolicyExtract {
  insurerId: number | null;
  year: number | null;
  persons: PersonExtract[];
  /** Le texte est vide ou presque : PDF scanné (image). */
  noText: boolean;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Variantes écrites d'une date de naissance : 03.04.1990, 3.4.1990, 03/04/1990. */
function dateVariants(iso: IsoDate): string[] {
  const [y, m, d] = iso.split("-");
  const dd = d!, mm = m!, d1 = String(Number(d)), m1 = String(Number(m));
  return [...new Set([`${dd}.${mm}.${y}`, `${d1}.${m1}.${y}`, `${dd}/${mm}/${y}`, `${dd}.${mm}.${y!.slice(2)}`])];
}

function firstIndex(hay: string, needles: string[]): number {
  let best = -1;
  for (const n of needles) {
    const i = hay.indexOf(n);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

/** Montants « 1'234.50 », « 412.30 », « 412,30 » (centimes obligatoires : évite les années et numéros). */
export function readAmounts(text: string): Rappen[] {
  const out: Rappen[] = [];
  for (const m of text.matchAll(/(?<![\d.,'’])(\d{1,3}(?:['’ ]\d{3})+|\d{1,5})[.,](\d{2}|–|-)(?!\.?\d)/g)) {
    const whole = Number(m[1]!.replace(/['’ ]/g, ""));
    const cents = /\d{2}/.test(m[2]!) ? Number(m[2]) : 0;
    out.push(whole * 100 + cents);
  }
  return out;
}

const FRANCHISE_KEY = /(franchise|jahresfranchise|franchigia|franchise annuelle)/i;

export function readFranchise(text: string, allowed: readonly number[]): number | null {
  for (const m of text.matchAll(new RegExp(FRANCHISE_KEY.source + "[^\\d]{0,40}(\\d{1,2}['’ ]?\\d{3}|\\d{1,4})", "gi"))) {
    const v = Number(m[2]!.replace(/['’ ]/g, ""));
    if (allowed.includes(v)) return v;
  }
  return null;
}

export function readAccident(text: string): boolean | null {
  const t = norm(text);
  if (/(sans|ohne|senza|exclu\w*|ausgeschlossen|esclus\w*)\s+(la\s+)?(couverture\s+|deckung\s+)?(accidents?|unfall\w*|infortuni\w*)|(accidents?|unfall\w*|infortuni\w*)\s*:?\s*(non|nein|no|exclu|ausgeschlossen|escluso)\b/.test(t)) return false;
  if (/(avec|mit|inkl\.?|incl\.?|inclus|y\.?\s?c\.?|con)\s+(la\s+)?(couverture\s+|deckung\s+)?(accidents?|unfall\w*|infortuni\w*)|(accidents?|unfall\w*|infortuni\w*)\s*:?\s*(oui|ja|si|inclus|eingeschlossen|incluso)\b|unfalldeckung|couverture accidents?/.test(t)) return true;
  return null;
}

export function readModel(text: string): ModelType | null {
  const t = norm(text);
  if (/telmed|tel-?doc|telemed|telemedecine|telefonmedizin|callmed|medcall|santé24|sante24|medi24|smartmed|telcare|benefit plus telmed|premed-24/.test(t)) return "TELMED";
  if (/pharm|apothek|farmaci/.test(t)) return "PHARMACY";
  if (/\bhmo\b|medecin de famille|hausarzt|medico di famiglia|cabinet de groupe|gesundheitspraxis|praxis|casamed|family doctor/.test(t)) return "PRAXIS";
  if (/\bflex|choix du premier|freie wahl der erstanlaufstelle/.test(t)) return "FLEX";
  if (/standard|libre choix|freie arztwahl|libera scelta|assurance de base ordinaire|ordentliche grundversicherung/.test(t)) return "STANDARD";
  return null;
}

export function readPolicyNumber(text: string): string | null {
  const m = /(?:n°|no\.?|nr\.?|numero|numéro|nummer)\s*(?:de\s+|du\s+|d['’]\s*)?(?:assur[ée]e?|police|client|versicherte[nr]?|kunden|polizza|assicurat[oa])\s*[:.]?\s*([A-Z0-9][A-Z0-9.\-/]{3,20})/i.exec(text)
    ?? /(?:versichertennummer|policennummer|kundennummer|numéro d['’]assuré|numéro de police)\s*[:.]?\s*([A-Z0-9][A-Z0-9.\-/]{3,20})/i.exec(text);
  return m ? m[1]!.replace(/[.\-/]+$/, "") : null;
}

const LCA_PATTERNS: [LcaGuarantee, RegExp][] = [
  ["HOSPITAL_SEMI_PRIVATE", /demi-?privee?|mi-?privee?|halbprivat|semi-?privat/],
  ["HOSPITAL_PRIVATE", /(division|hospitalisation|chambre)\s+privee|privatabteilung|spital\s+privat|hospital\s+privat|\bprivat(e)?\s+(spital|hospital)/],
  ["HOSPITAL_FLEX", /hospital\w*\s*flex|flex\w*\s*(hospital|spital)|hopital\s*flex/],
  ["HOSPITAL_GENERAL", /division commune|allgemeine abteilung|spital allgemein|hospital\w*\s+(eco|general|commune)|toute la suisse|ganze schweiz/],
  ["DENTAL", /dentaire|dental|zahn/],
  ["ALTERNATIVE", /medecines? (complementaires?|alternatives?|naturelles?)|komplementarmedizin|alternativmedizin|naturheil|naturopath/],
  ["TRAVEL", /voyage|reise|etranger|ausland|travel|vacanza/],
  ["AMBULATORY", /complementaire ambulatoire|ambulant\w*\s+(zusatz|plus|top)|zusatzversicherung ambulant|traitements ambulatoires|ambulatoire/],
];

/** Complémentaires repérées par familles de garanties, avec un montant lu juste après le libellé. */
export function readLca(text: string): PersonExtract["lca"] {
  const t = norm(text);
  if (!/(lca|vvg|complementaire|zusatz|supplementar|hospital|spital|dentaire|zahn)/.test(t)) return [];
  const found: PersonExtract["lca"] = [];
  for (const [guarantee, re] of LCA_PATTERNS) {
    const m = new RegExp(re.source, "g").exec(t);
    if (!m) continue;
    // Un même libellé (« Hospital privat ») ne doit pas compter deux fois.
    if (guarantee === "HOSPITAL_PRIVATE" && found.some((f) => f.guarantee === "HOSPITAL_SEMI_PRIVATE") && /halb|demi|mi-|semi/.test(t.slice(Math.max(0, m.index - 6), m.index))) continue;
    const after = text.slice(m.index, m.index + 160);
    const amount = readAmounts(after)[0] ?? null;
    found.push({ guarantee, monthlyRp: amount !== null && amount < 100_000 ? amount : null });
  }
  return found;
}

export function readYear(text: string, minYear: number, maxYear: number): number | null {
  const counts = new Map<number, number>();
  for (const m of text.matchAll(/0?1[./]0?1[./](20\d{2})/g)) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 3);
  for (const m of text.matchAll(/\b(?:police|prämie\w*|primes?|année|jahr|anno|polizza|gültig ab|valable dès|dès le|ab)\D{0,12}(20\d{2})/gi)) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 2);
  const candidates = [...counts].filter(([y]) => y >= minYear && y <= maxYear).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  return candidates[0]?.[0] ?? null;
}

export function findInsurer(text: string, insurers: readonly ImportInsurer[]): number | null {
  const t = norm(text);
  let best: { id: number; score: number } | null = null;
  for (const ins of insurers) {
    let score = 0;
    for (const n of ins.names) {
      const k = norm(n).trim();
      if (k.length < 3) continue;
      const re = new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "g");
      const hits = t.match(re)?.length ?? 0;
      score += hits * k.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { id: ins.id, score };
  }
  return best?.id ?? null;
}

/**
 * Découpe la police par personne : chaque personne commence à la première mention de sa date
 * de naissance (ou de son nom), jusqu'à la personne suivante. Une police d'une seule personne
 * du foyer, sans date reconnue, est attribuée entièrement à cette personne.
 */
export function splitByPerson(text: string, persons: readonly ImportPerson[]): { personId: number; text: string }[] {
  const t = norm(text);
  const starts = persons
    .map((p) => {
      const byDate = firstIndex(text, dateVariants(p.birthDate));
      const byName = firstIndex(t, [norm(`${p.lastName} ${p.firstName}`), norm(`${p.firstName} ${p.lastName}`)]);
      const idx = byDate !== -1 ? (byName !== -1 && byName < byDate && byDate - byName < 200 ? byName : byDate) : byName;
      return { personId: p.id, idx };
    })
    .filter((s) => s.idx !== -1)
    .sort((a, b) => a.idx - b.idx);
  if (starts.length === 0) return persons.length === 1 ? [{ personId: persons[0]!.id, text }] : [];
  return starts.map((s, i) => ({ personId: s.personId, text: text.slice(s.idx, starts[i + 1]?.idx ?? text.length) }));
}

export function extractPolicy(
  text: string,
  ctx: { persons: readonly ImportPerson[]; insurers: readonly ImportInsurer[]; franchises: readonly number[]; minYear: number; maxYear: number },
): PolicyExtract {
  const clean = text.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  if (clean.replace(/\s/g, "").length < 40) return { insurerId: null, year: null, persons: [], noText: true };
  const head = clean.slice(0, 1500);
  const common = {
    accident: readAccident(clean),
    model: readModel(clean),
    franchise: readFranchise(clean, ctx.franchises),
    policyNumber: readPolicyNumber(head) ?? readPolicyNumber(clean),
  };
  const persons = splitByPerson(clean, ctx.persons).map(({ personId, text: part }): PersonExtract => ({
    personId,
    policyNumber: readPolicyNumber(part) ?? common.policyNumber,
    franchiseChf: readFranchise(part, ctx.franchises) ?? common.franchise,
    accident: readAccident(part) ?? common.accident,
    modelType: readModel(part) ?? common.model,
    amountsRp: [...new Set(readAmounts(part))],
    lca: readLca(part),
  }));
  return {
    insurerId: findInsurer(head, ctx.insurers) ?? findInsurer(clean, ctx.insurers),
    year: readYear(clean, ctx.minYear, ctx.maxYear),
    persons,
    noText: false,
  };
}
