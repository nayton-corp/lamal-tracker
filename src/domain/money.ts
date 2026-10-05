/**
 * Montants en centimes (Rappen), toujours entiers. Jamais de float pour de l'argent :
 * les conversions passent par ici et nulle part ailleurs.
 */
export type Rappen = number;

/** Accepte 432.1, "432.10", "432,10", "1'234.50", "1’234.50", "CHF 12". */
export function parseChf(input: number | string): Rappen {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error(`Montant invalide : ${input}`);
    // Passe par la représentation décimale la plus courte (1.005 → "1.005"), pas par input × 100.
    const [whole = "0", frac = ""] = Math.abs(input).toFixed(10).replace(/0+$/, "").split(".");
    const rp = Number(whole) * 100 + Number(frac.slice(0, 2).padEnd(2, "0")) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
    return input < 0 ? -rp : rp;
  }
  const cleaned = input
    .replace(/chf/i, "")
    .replace(/[\s'’  ]/g, "")
    .replace(",", ".");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) {
    throw new Error(`Montant invalide : « ${input} »`);
  }
  const [whole = "0", frac = ""] = cleaned.replace("-", "").split(".");
  const rp = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return cleaned.startsWith("-") ? -rp : rp;
}

/** Arrondi suisse aux 5 centimes, pour les montants affichés comme payables. */
export function roundTo5(rp: Rappen): Rappen {
  return Math.round(rp / 5) * 5;
}

function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "’");
}

export interface FormatOptions {
  /** Affiche + devant les montants positifs (variations). */
  signed?: boolean;
  /** Sans les centimes (montants annuels arrondis au franc). */
  whole?: boolean;
  /** Préfixe « CHF ». */
  currency?: boolean;
}

/**
 * Format déterministe (identique serveur et client) : « CHF 1’234.50 ».
 * On n'utilise pas Intl fr-CH, qui mélange virgule et point selon le style.
 */
export function formatChf(rp: Rappen, opts: FormatOptions = {}): string {
  const { signed = false, whole = false, currency = true } = opts;
  const negative = rp < 0;
  const abs = Math.abs(rp);
  const body = whole
    ? group(Math.round(abs / 100))
    : `${group(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, "0")}`;
  const sign = negative ? "−" : signed && rp > 0 ? "+" : "";
  return `${currency ? "CHF " : ""}${sign}${body}`;
}

/** Variation relative en pour-mille entiers, pour éviter les floats en base. */
export function changePermille(from: Rappen, to: Rappen): number | null {
  if (from === 0) return null;
  return Math.round(((to - from) * 1000) / from);
}

export function formatPermille(permille: number | null, signed = true): string {
  if (permille === null) return "—";
  const sign = permille < 0 ? "−" : signed && permille > 0 ? "+" : "";
  const abs = Math.abs(permille);
  return `${sign}${Math.floor(abs / 10)}.${abs % 10} %`;
}
