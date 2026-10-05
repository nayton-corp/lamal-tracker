import { cellText, type Sheet } from "./workbook";

/**
 * Données de surveillance de l'assurance de base (OFSP, « Aufsichtsdaten OKP », un onglet par
 * année, tableau T 5.01). Les colonnes sont repérées par leur code officiel (ligne de codes
 * sous l'en-tête : 1, 3B, 6B, 9B…), stable d'une année à l'autre, et non par leur libellé.
 */
export interface SupervisoryRow {
  bagNumber: number;
  year: number;
  /** Effectif moyen d'assurés (code 1). */
  insured: number;
  /** Primes par assuré et par an, en centimes (3B). */
  premiumPerInsuredRp: number;
  /** Prestations nettes par assuré, en centimes (5B). */
  benefitsPerInsuredRp: number | null;
  /** Frais administratifs par assuré, en centimes (6B). */
  adminPerInsuredRp: number | null;
  /** Réserves par assuré, en centimes (9B). */
  reservesPerInsuredRp: number | null;
}

const CODES = { insured: "1", premium: "3B", benefits: "5B", admin: "6B", reserves: "9B" } as const;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(cellText(v).replace(/[’'\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const rp = (v: unknown) => {
  const n = num(v);
  return n === null ? null : Math.round(n * 100);
};

/** Un onglet par année (nommé « AAAA »), à partir de `minYear` ; erreur si aucun tableau n'est reconnu. */
export function parseSupervisoryData(sheets: readonly Sheet[], minYear = 2015): SupervisoryRow[] {
  const out: SupervisoryRow[] = [];
  for (const sheet of sheets) {
    if (!/^\d{4}$/.test(sheet.name.trim())) continue;
    const year = Number(sheet.name.trim());
    if (year < minYear) continue;
    const codeRow = sheet.rows.findIndex((r) => r.some((c) => cellText(c).trim() === "3B") && r.some((c) => cellText(c).trim() === "9B"));
    if (codeRow === -1) continue;
    const codes = sheet.rows[codeRow]!.map((c) => cellText(c).trim());
    const at = (code: string) => codes.indexOf(code);
    const idx = { insured: at(CODES.insured), premium: at(CODES.premium), benefits: at(CODES.benefits), admin: at(CODES.admin), reserves: at(CODES.reserves) };
    if (idx.insured === -1 || idx.premium === -1) continue;
    for (const row of sheet.rows.slice(codeRow + 1)) {
      const bag = num(row[0]);
      if (bag === null || !Number.isInteger(bag) || bag <= 0) continue;
      const insured = num(row[idx.insured]);
      const premium = rp(row[idx.premium]);
      if (!insured || insured <= 0 || premium === null) continue;
      out.push({
        bagNumber: bag,
        year,
        insured: Math.round(insured),
        premiumPerInsuredRp: premium,
        benefitsPerInsuredRp: idx.benefits === -1 ? null : rp(row[idx.benefits]),
        adminPerInsuredRp: idx.admin === -1 ? null : rp(row[idx.admin]),
        reservesPerInsuredRp: idx.reserves === -1 ? null : rp(row[idx.reserves]),
      });
    }
  }
  if (out.length === 0) throw new Error("Données de surveillance : aucun tableau T 5.01 reconnu.");
  return out.sort((a, b) => a.year - b.year || a.bagNumber - b.bagNumber);
}

export const SUPERVISORY_PAGE_URL = "https://www.bag.admin.ch/de/aufsichtsdaten-krankenversicherer";

/** Lien du classeur le plus récent (année dans le nom du fichier) trouvé dans la page de l'OFSP ; null sinon. */
export function pickSupervisoryLink(html: string, base = "https://www.bag.admin.ch"): string | null {
  const links = [...html.matchAll(/href="([^"]+\.xlsx)"/gi)]
    .map((m) => new URL(m[1]!.replace(/&amp;/g, "&"), base).toString())
    .filter((u) => /aufsichtsdaten/i.test(u));
  links.sort((a, b) => (/(\d{4})\.xlsx/.exec(b)?.[1] ?? "").localeCompare(/(\d{4})\.xlsx/.exec(a)?.[1] ?? ""));
  return links[0] ?? null;
}
