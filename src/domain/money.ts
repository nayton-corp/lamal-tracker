/**
 * Montants en centimes (« Rappen ») entiers. Aucun calcul monétaire ne passe par un float.
 */
export type Rappen = number;

const NARROW_NBSP = " ";

export function assertRappen(value: number, label = "montant"): Rappen {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Le ${label} doit être un entier en centimes (reçu ${value}).`);
  }
  return value;
}

/**
 * Convertit une saisie en francs (« 1'234.55 », « 1 234,55 », « CHF 12.30 », 351.4) en centimes.
 * Passe par le texte décimal, jamais par `x * 100`, pour éviter 1.005 * 100 = 100.49999.
 */
export function chfToRappen(input: string | number): Rappen {
  let text: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new Error(`Montant invalide : ${input}`);
    text = input.toFixed(10);
  } else {
    text = input
      .trim()
      .replace(/^CHF\s*/i, "")
      .replace(/\s*(CHF|Fr\.?)$/i, "")
      .replace(/['’\s  ]/g, "");
    // Une virgule seule sert de séparateur décimal (« 12,30 »).
    if (text.includes(",") && !text.includes(".")) text = text.replace(",", ".");
    else text = text.replace(/,/g, "");
    if (text === "" || text === "-" || text === "–") throw new Error(`Montant invalide : « ${input} »`);
  }
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) throw new Error(`Montant invalide : « ${input} »`);
  const [, sign, whole = "", frac = ""] = match;
  if (whole === "" && frac === "") throw new Error(`Montant invalide : « ${input} »`);
  const cents = Number(frac.slice(0, 2).padEnd(2, "0"));
  const roundUp = Number(frac[2] ?? "0") >= 5 ? 1 : 0;
  const rp = Number(whole || "0") * 100 + cents + roundUp;
  return assertRappen(sign === "-" ? -rp : rp);
}

/** Arrondi suisse au multiple de 5 centimes le plus proche (0.025 → 0.05). */
export function roundTo5(rp: Rappen): Rappen {
  const sign = rp < 0 ? -1 : 1;
  const abs = Math.abs(rp);
  return sign * (Math.floor((abs + 2) / 5) * 5) || 0;
}

export interface FormatOptions {
  /** Affiche toujours le signe (+ / −). */
  signed?: boolean;
  /** Préfixe « CHF ». Par défaut vrai. */
  currency?: boolean;
  /** Masque les centimes quand ils valent 0 (« CHF 412 »). */
  compact?: boolean;
}

/**
 * Format suisse romand : « CHF 1 234.50 ». Implémenté à la main (pas d'Intl) pour un rendu
 * identique côté serveur et navigateur, sans écart d'hydratation.
 */
export function formatChf(rp: Rappen, options: FormatOptions = {}): string {
  const { signed = false, currency = true, compact = false } = options;
  const abs = Math.abs(Math.round(rp));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NBSP);
  const decimals = compact && cents === 0 ? "" : `.${String(cents).padStart(2, "0")}`;
  const sign = rp < 0 ? "−" : signed && rp > 0 ? "+" : "";
  return `${sign}${currency ? "CHF " : ""}${grouped}${decimals}`;
}

/** Pourcentage en points de base (1 % = 100) formaté « +7.4 % ». */
export function formatPercentBp(bp: number, signed = true): string {
  const tenths = Math.round(Math.abs(bp) / 10);
  const value = `${Math.floor(tenths / 10)}.${tenths % 10}`;
  const sign = bp < 0 ? "−" : signed && bp > 0 ? "+" : "";
  return `${sign}${value} %`;
}

export function sumRappen(values: readonly Rappen[]): Rappen {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Variation relative en points de base, arrondie (null si la base est nulle). */
export function relativeChangeBp(from: Rappen, to: Rappen): number | null {
  if (from === 0) return null;
  return Math.round(((to - from) * 10_000) / from);
}
