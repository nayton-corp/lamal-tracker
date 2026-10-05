import type { IsoDate } from "./dates";
import type { LcaGuarantee } from "./lca";
import type { ModelType } from "./lamal";
import type { Rappen } from "./money";
import { foldForSearch } from "./text";

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
  /** Noms connus : nom usuel, raisons sociales. */
  names: string[];
  /** Nom du groupe, partagé par plusieurs caisses (Groupe Mutuel, Helsana…) : pèse peu. */
  group?: string | null;
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

const norm = foldForSearch;

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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Première occurrence d'une date, sans qu'elle soit la fin d'une autre (1.2.2015 dans 11.2.2015). */
function firstDateIndex(hay: string, variants: string[]): number {
  let best = -1;
  for (const v of variants) {
    const m = new RegExp(`(?<![\\d.])${escapeRe(v)}(?!\\d)`).exec(hay);
    if (m && (best === -1 || m.index < best)) best = m.index;
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

/** Premier montant après « franchise » (fr, de, it) qui fait partie des franchises autorisées ; null sinon. */
export function readFranchise(text: string, allowed: readonly number[]): number | null {
  for (const m of text.matchAll(new RegExp(FRANCHISE_KEY.source + "[^\\d]{0,40}(\\d{1,2}['’ ]?\\d{3}|\\d{1,4})", "gi"))) {
    const v = Number(m[2]!.replace(/['’ ]/g, ""));
    if (allowed.includes(v)) return v;
  }
  return null;
}

/**
 * Couverture accidents lue sur la police : `false` si exclue, `true` si incluse, `null` si muette.
 * Attention : deux `\s*` qui se suivent (« \s*:?\s* ») font exploser le temps de calcul sur une
 * longue suite de sauts de ligne (ReDoS, tout le serveur gèle). D'où `\s*(?::\s*)?`.
 */
export function readAccident(text: string): boolean | null {
  const t = norm(text);
  if (/(sans|ohne|senza|exclu\w*|ausgeschlossen|esclus\w*)\s+(la\s+)?(couverture\s+|deckung\s+)?(accidents?|unfall\w*|infortuni\w*)|(accidents?|unfall\w*|infortuni\w*)\s*(?::\s*)?(non|nein|no|exclu|ausgeschlossen|escluso)\b/.test(t)) return false;
  if (/(avec|mit|inkl\.?|incl\.?|inclus|y\.?\s?c\.?|con)\s+(la\s+)?(couverture\s+|deckung\s+)?(accidents?|unfall\w*|infortuni\w*)|(accidents?|unfall\w*|infortuni\w*)\s*(?::\s*)?(oui|ja|si|inclus|eingeschlossen|incluso)\b|unfalldeckung|couverture accidents?/.test(t)) return true;
  return null;
}

/** Modèle deviné par mots-clés (fr, de, it), du plus spécifique (télémédecine) au plus général (standard). */
export function readModel(text: string): ModelType | null {
  const t = norm(text);
  if (/telmed|tel-?doc|telemed|telemedecine|telefonmedizin|callmed|medcall|santé24|sante24|medi24|smartmed|telcare|benefit plus telmed|premed-24/.test(t)) return "TELMED";
  if (/pharm|apothek|farmaci/.test(t)) return "PHARMACY";
  if (/\bhmo\b|medecin de famille|hausarzt|medico di famiglia|cabinet de groupe|gesundheitspraxis|praxis|casamed|family doctor/.test(t)) return "PRAXIS";
  if (/\bflex|choix du premier|freie wahl der erstanlaufstelle/.test(t)) return "FLEX";
  if (/standard|libre choix|freie arztwahl|libera scelta|assurance de base ordinaire|ordentliche grundversicherung/.test(t)) return "STANDARD";
  return null;
}

/** Numéro AVS suisse 756.XXXX.XXXX.XC : 13 chiffres avec clé de contrôle EAN-13. */
export function isValidAvs(value: string): boolean {
  const d = value.replace(/\D/g, "");
  if (!/^756\d{10}$/.test(d)) return false;
  const sum = [...d.slice(0, 12)].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

export type IdentifierKind = "INSURED" | "POLICY" | "AVS";

export interface Identifier {
  kind: IdentifierKind;
  value: string;
  /** Position dans le texte, pour l'attribuer à la personne la plus proche. */
  index: number;
}

/*
 * Libellés rencontrés sur les polices (fr, de, it), y compris en tableau : la valeur suit le
 * libellé sur la même ligne ou sur la suivante. Trois notions distinctes : numéro d'assuré (par
 * personne et par caisse), numéro de police (souvent commun au foyer) et numéro AVS.
 */
const ID_LABELS: [IdentifierKind, RegExp][] = [
  ["INSURED", /(?:\bn[°ºo]?\.?\s*|\bnr\.?\s*|\bnum[ée]ro\s+)(?:d['’]\s*)?assur[ée]e?s?(?!\p{L})|versicherten[\s-]*(?:nr\.?|nummer)|\bvers\.?[\s-]*nr\.?|\bnum(?:ero)?\.?\s*(?:d['’]\s*)?assicurat[oa]|\bkunden[\s-]*(?:nr\.?|nummer)|\bn[°º]?\.?\s*(?:de\s+)?(?:client|membre)\b|mitglied(?:er)?[\s-]*(?:nr\.?|nummer)|\bn[°º]\s*(?:de\s+)?personne\b/giu],
  ["POLICY", /\bpolic[ea]n?[\s-]*(?:nr\.?|nummer)|\bpolice\s+n[°ºo]?\.?(?=\s*[:.]?\s*[A-Z0-9])|\bpolizza\s+n[°ºo.]?|\bpolizzen?[\s-]*(?:nr\.?|nummer)|\bnum[ée]ro\s+de\s+(?:la\s+)?police|\bn[°ºo]?\.?\s*(?:de\s+)?police\b|\bvertrags[\s-]*(?:nr\.?|nummer)|\bnum(?:ero)?\.?\s*(?:di\s+)?polizza|\bn[°ºo]?\.?\s*(?:de\s+)?contrat\b/giu],
  ["AVS", /\b(?:n[°ºo]?\.?\s*)?(?:avs|ahv|ahvn13|nss)\b(?![\s-]*(?:beitr|cotis))|sozialversicherungs[\s-]*(?:nr\.?|nummer)|num[ée]ro\s+d['’]assurance\s+sociale|numero\s+(?:di\s+)?assicurazione\s+sociale/giu],
];
/** Valeur : préfixe de lettres facultatif, puis au moins 5 chiffres (séparateurs . - / espace). */
const ID_VALUE = /(?:[A-Z]{1,3}[ -]?)?\d[\d .\-/]{3,24}\d/;
const AVS_RE = /(?<![\d.])756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}(?!\d)/g;
const IS_DATE = /^\d{1,2}[./]\d{1,2}[./](?:\d{2}|\d{4})$/;
const IS_AMOUNT = /^\d{1,5}[.,]\d{2}$/;
const IS_PHONE = /^0\d{2}\s?\d{3}\s?\d{2}\s?\d{2}$/;

function cleanIdValue(raw: string): string | null {
  const v = raw.trim().replace(/\s+/g, " ").replace(/[.\-/]+$/, "");
  const digits = v.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 20) return null;
  if (IS_DATE.test(v) || IS_AMOUNT.test(v) || IS_PHONE.test(v)) return null;
  return v;
}

/** Tous les numéros (assuré, police, AVS) avec leur position ; les AVS sont vérifiés par leur clé. */
export function readIdentifiers(text: string): Identifier[] {
  const t = text.normalize("NFKC").replace(/\u00a0/g, " ");
  const out: Identifier[] = [];
  const seen = new Set<string>();
  const push = (kind: IdentifierKind, value: string, index: number) => {
    const key = `${kind}:${value.replace(/\D/g, "")}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, value, index });
  };
  for (const [kind, re] of ID_LABELS) {
    for (const m of t.matchAll(re)) {
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 80);
      // Même ligne d'abord ; sinon la ligne suivante (mise en page en tableau).
      const line = after.split("\n")[0] ?? "";
      const next = after.split("\n")[1] ?? "";
      const found = ID_VALUE.exec(line.replace(/^[\s:.]+/, "")) ?? ID_VALUE.exec(next.replace(/^[\s:.]+/, ""));
      if (!found) continue;
      const value = cleanIdValue(found[0]);
      if (!value) continue;
      push(isValidAvs(value) ? "AVS" : kind, value, m.index);
    }
  }
  for (const m of t.matchAll(AVS_RE)) if (isValidAvs(m[0])) push("AVS", m[0].replace(/\s/g, "."), m.index);
  return out.sort((a, b) => a.index - b.index);
}

/**
 * Numéro à indiquer sur les courriers : d'abord le numéro d'assuré, sinon l'AVS, sinon le numéro
 * de police. Avec une position de référence (la personne), le candidat le plus proche gagne.
 */
export function pickIdentifier(ids: readonly Identifier[], near?: number): string | null {
  const byKind = (kind: IdentifierKind) => {
    const list = ids.filter((i) => i.kind === kind);
    if (near === undefined) return list[0] ?? null;
    return [...list].sort((a, b) => Math.abs(a.index - near) - Math.abs(b.index - near))[0] ?? null;
  };
  return (byKind("INSURED") ?? byKind("AVS") ?? byKind("POLICY"))?.value ?? null;
}

/** Compatibilité : premier numéro utile du texte. */
export function readPolicyNumber(text: string): string | null {
  return pickIdentifier(readIdentifiers(text));
}

/* ---- Titulaire : personnes et adresse, pour commencer l'accueil depuis la police ---- */

export interface HolderPerson {
  firstName: string;
  lastName: string;
  birthDate: IsoDate;
}

export interface HolderAddress {
  street: string;
  postalCode: string;
  city: string;
}

export interface PolicyHolder {
  persons: HolderPerson[];
  address: HolderAddress | null;
}

const SALUTATION = /^(?:monsieur|madame|mademoiselle|m\.|mme|mlle|herr|frau|familie|famille|famiglia|signor[ae]?|sig\.|sig\.ra|dr\.?|e\.v\.)\s*/i;
const DATE_RE = /(?<![\d.])(\d{1,2})[./](\d{1,2})[./]((?:19|20)\d{2})(?!\d)/g;
/** Mots qui précèdent une date qui n'est pas une naissance (validité, édition). */
const NOT_BIRTH = /(valable|g[üu]ltig|d[èe]s|ab|du|au|bis|vom|le|den|il|dal|al|date|datum|data|édition|version|stand|imprim|druck|stampa|début|debut|fin|ende|échéance)\W{0,3}$/i;
const BIRTH_HINT = /(n[ée]e?\s+le|naissance|geb(?:oren|\.|urtsdatum)?(?:\s+am)?|nat[oa]\s+il|nascita)\W{0,12}$/i;
const NAME_TOKEN = "[\\p{Lu}][\\p{L}'’-]+";
const NAME_RE = new RegExp(`(${NAME_TOKEN}(?:[ ]${NAME_TOKEN}){1,3})`, "u");

function isoFrom(d: string, m: string, y: string): IsoDate | null {
  const day = Number(d), month = Number(m), year = Number(y);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Nom lu à côté d'une date : « Nom Prénom » ou « Prénom Nom », civilité retirée. */
function nameNear(text: string, index: number, end: number): string | null {
  const before = text.slice(Math.max(0, index - 80), index).split("\n").pop() ?? "";
  const cleanedBefore = before
    .replace(/(n[ée]e?\s+le|geb(?:oren|\.)?(?:\s+am)?|nat[oa]\s+il|geburtsdatum|date de naissance|data di nascita)\W*$/i, "")
    .replace(/[\s,;:·|-]+$/, "");
  const fromBefore = NAME_RE.exec(cleanedBefore.replace(SALUTATION, ""));
  if (fromBefore && cleanedBefore.endsWith(fromBefore[1]!)) return fromBefore[1]!;
  const after = text.slice(end, end + 80).split("\n")[0] ?? "";
  const fromAfter = NAME_RE.exec(after.replace(/^\W+/, "").replace(SALUTATION, ""));
  if (fromAfter && after.replace(/^\W+/, "").replace(SALUTATION, "").startsWith(fromAfter[1]!)) return fromAfter[1]!;
  return null;
}

function splitName(full: string, familyName: string | null): { firstName: string; lastName: string } {
  const tokens = full.split(" ");
  if (familyName) {
    const i = tokens.findIndex((t) => t.localeCompare(familyName, undefined, { sensitivity: "base" }) === 0);
    if (i === 0) return { firstName: tokens.slice(1).join(" "), lastName: tokens[0]! };
    if (i > 0) return { firstName: tokens.slice(0, i).join(" "), lastName: tokens.slice(i).join(" ") };
  }
  // Par défaut « Nom Prénom » (ordre des tableaux de police) ; corrigé par l'utilisateur au besoin.
  return { firstName: tokens.slice(1).join(" "), lastName: tokens[0]! };
}

/**
 * Personnes (nom + date de naissance) et adresse postale lues sur la police, pour créer le foyer
 * sans rien retaper. Les dates de validité (01.01.AAAA, « valable dès ») sont écartées.
 */
export function readHolder(text: string, opts: { maxYear: number; insurerNames?: readonly string[] }): PolicyHolder {
  const t = text.normalize("NFKC").replace(/\u00a0/g, " ");
  const persons: { name: string; birthDate: IsoDate }[] = [];
  for (const m of t.matchAll(DATE_RE)) {
    const iso = isoFrom(m[1]!, m[2]!, m[3]!);
    if (!iso) continue;
    const year = Number(m[3]);
    if (year > opts.maxYear || year < opts.maxYear - 110) continue;
    const before = t.slice(Math.max(0, m.index - 30), m.index);
    const birthHint = BIRTH_HINT.test(before);
    if (!birthHint && (NOT_BIRTH.test(before) || (m[1] === "01" || m[1] === "1") && (m[2] === "01" || m[2] === "1"))) continue;
    if (!birthHint && year >= opts.maxYear - 1) continue;
    const name = nameNear(t, m.index, m.index + m[0].length);
    if (!name) continue;
    if (persons.some((p) => p.birthDate === iso)) continue;
    persons.push({ name, birthDate: iso });
  }
  // Le nom de famille est le jeton commun aux membres ; sinon celui de l'enveloppe.
  const tokenCounts = new Map<string, number>();
  for (const p of persons) for (const tok of new Set(p.name.split(" "))) tokenCounts.set(tok, (tokenCounts.get(tok) ?? 0) + 1);
  const shared = [...tokenCounts].filter(([, n]) => n > 1 && persons.length > 1).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const address = readAddress(t, opts.insurerNames ?? []);
  const familyName = shared ?? address?.name?.split(" ").pop() ?? null;
  return {
    persons: persons.map((p) => ({ ...splitName(p.name, familyName), birthDate: p.birthDate })),
    address: address ? { street: address.street, postalCode: address.postalCode, city: address.city } : null,
  };
}

const NPA_LINE = /^(?:CH-)?(\d{4})\s+([\p{Lu}][\p{L} .'’-]{1,40})$/u;
const STREET_LINE = /^[\p{L}][\p{L} .'’-]{2,50}\s\d{1,4}\s?[a-zA-Z]?$/u;
const INSURER_ADDRESS = /case postale|postfach|casella postale|service client|kundendienst|assurances? sa|versicherungen? ag|krankenkasse|caisse[- ]maladie/i;

/** Bloc adresse du destinataire : civilité/nom, rue et numéro, NPA + localité, dans la première page. */
function readAddress(text: string, insurerNames: readonly string[]): { name: string | null; street: string; postalCode: string; city: string } | null {
  const lines = text.slice(0, 4000).split("\n").map((l) => l.trim());
  const insurer = insurerNames.map((n) => norm(n)).filter((n) => n.length >= 3);
  for (let i = 0; i < lines.length; i++) {
    const m = NPA_LINE.exec(lines[i]!);
    if (!m) continue;
    const block = lines.slice(Math.max(0, i - 4), i);
    const blockText = norm(block.join(" "));
    if (INSURER_ADDRESS.test(block.join(" ")) || insurer.some((n) => blockText.includes(n))) continue;
    const street = [...block].reverse().find((l) => STREET_LINE.test(l) && !/^\d{4}\s/.test(l));
    if (!street) continue;
    const streetIdx = block.lastIndexOf(street);
    const nameLine = block.slice(0, streetIdx).reverse().find((l) => NAME_RE.test(l.replace(SALUTATION, "")));
    return { name: nameLine ? (NAME_RE.exec(nameLine.replace(SALUTATION, ""))?.[1] ?? null) : null, street, postalCode: m[1]!, city: m[2]!.trim() };
  }
  return null;
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

/** Année de couverture la plus citée : « 01.01.AAAA » pèse plus qu'une année après « primes », « police »… ; à égalité, la plus récente. */
export function readYear(text: string, minYear: number, maxYear: number): number | null {
  const counts = new Map<number, number>();
  for (const m of text.matchAll(/0?1[./]0?1[./](20\d{2})/g)) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 3);
  for (const m of text.matchAll(/\b(?:police|prämie\w*|primes?|année|jahr|anno|polizza|gültig ab|valable dès|dès le|ab)\D{0,12}(20\d{2})/gi)) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 2);
  const candidates = [...counts].filter(([y]) => y >= minYear && y <= maxYear).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  return candidates[0]?.[0] ?? null;
}

/**
 * Caisse la plus citée. Le nom de groupe (`groupName`, partagé par plusieurs caisses) pèse peu ;
 * une égalité parfaite entre deux caisses ne tranche pas (la prime exacte le fera).
 */
export function findInsurer(text: string, insurers: readonly ImportInsurer[]): number | null {
  const t = norm(text);
  const scored = insurers
    .map((ins) => {
      let score = 0;
      const count = (n: string, weight: number) => {
        const k = norm(n).trim();
        if (k.length < 3) return;
        const re = new RegExp(`(^|[^a-z])${escapeRe(k)}([^a-z]|$)`, "g");
        score += (t.match(re)?.length ?? 0) * k.length * weight;
      };
      for (const n of ins.names) count(n, 1);
      if (ins.group) count(ins.group, 0.25);
      return { id: ins.id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return null;
  return scored[0]!.id;
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
      const byDate = firstDateIndex(text, dateVariants(p.birthDate));
      const byName = firstIndex(t, [norm(`${p.lastName} ${p.firstName}`), norm(`${p.firstName} ${p.lastName}`)]);
      const idx = byDate !== -1 ? (byName !== -1 && byName < byDate && byDate - byName < 200 ? byName : byDate) : byName;
      return { personId: p.id, idx };
    })
    .filter((s) => s.idx !== -1)
    .sort((a, b) => a.idx - b.idx);
  if (starts.length === 0) return persons.length === 1 ? [{ personId: persons[0]!.id, text }] : [];
  return starts.map((s, i) => ({ personId: s.personId, text: text.slice(s.idx, starts[i + 1]?.idx ?? text.length) }));
}

/** Longueur maximale de texte analysée (une police tient en quelques pages). */
export const MAX_POLICY_TEXT = 200_000;

/**
 * Point d'entrée : tout ce qu'on lit d'une police pour les personnes du foyer. Ce qui manque dans
 * la partie d'une personne est repris de la police entière. `noText` : PDF sans texte (scanné).
 */
export function extractPolicy(
  text: string,
  ctx: { persons: readonly ImportPerson[]; insurers: readonly ImportInsurer[]; franchises: readonly number[]; minYear: number; maxYear: number },
): PolicyExtract {
  const clean = text.slice(0, MAX_POLICY_TEXT).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  if (clean.replace(/\s/g, "").length < 40) return { insurerId: null, year: null, persons: [], noText: true };
  const head = clean.slice(0, 1500);
  const ids = readIdentifiers(clean);
  const common = {
    accident: readAccident(clean),
    model: readModel(clean),
    franchise: readFranchise(clean, ctx.franchises),
  };
  let offset = 0;
  const parts = splitByPerson(clean, ctx.persons).map(({ personId, text: part }) => {
    const start = clean.indexOf(part, offset);
    offset = start + 1;
    return { personId, part, start };
  });
  // Un numéro d'assuré va à la personne dont il est le plus proche (il précède souvent le nom).
  const nearest = (index: number) => parts.reduce((best, p) => (Math.abs(p.start - index) < Math.abs(best.start - index) ? p : best), parts[0]!);
  const policyId = pickIdentifier(ids.filter((i) => i.kind === "POLICY"));
  const persons = parts.map(({ personId, part, start }): PersonExtract => {
    const own = ids.filter((i) => i.kind !== "POLICY" && nearest(i.index).personId === personId);
    return {
    personId,
    policyNumber: pickIdentifier(own, start) ?? policyId,
    franchiseChf: readFranchise(part, ctx.franchises) ?? common.franchise,
    accident: readAccident(part) ?? common.accident,
    modelType: readModel(part) ?? common.model,
    amountsRp: [...new Set(readAmounts(part))],
    lca: readLca(part),
    };
  });
  return {
    insurerId: findInsurer(head, ctx.insurers) ?? findInsurer(clean, ctx.insurers),
    year: readYear(clean, ctx.minYear, ctx.maxYear),
    persons,
    noText: false,
  };
}
