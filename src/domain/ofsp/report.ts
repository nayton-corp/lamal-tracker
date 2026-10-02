import { CANTONS } from "../lamal";
import type { Rappen } from "../money";
import type { PremiumRow, SkipReason } from "./normalize";

export interface ValidationReport {
  ok: boolean;
  year: number | null;
  errors: string[];
  warnings: string[];
  stats: {
    rowsRead: number;
    rowsKept: number;
    duplicates: number;
    skipped: Partial<Record<SkipReason, number>>;
    cantons: number;
    insurers: number;
    tariffs: number;
    minPremiumRp: Rappen | null;
    maxPremiumRp: Rappen | null;
    /** Médiane des primes adulte, franchise 300, sans accident, par canton (rappen). */
    adultMedianByCanton: Record<string, Rappen>;
  };
}

/** Accumule les statistiques d'un import en flux, sans garder les lignes en mémoire. */
export class ImportAccumulator {
  rowsRead = 0;
  rowsKept = 0;
  duplicates = 0;
  readonly skipped: Partial<Record<SkipReason, number>> = {};
  private readonly years = new Map<number, number>();
  private readonly cantons = new Set<string>();
  private readonly insurers = new Set<number>();
  private readonly tariffs = new Set<string>();
  private min: Rappen | null = null;
  private max: Rappen | null = null;
  private readonly adultSamples = new Map<string, Rappen[]>();

  skip(reason: SkipReason): void {
    this.rowsRead++;
    this.skipped[reason] = (this.skipped[reason] ?? 0) + 1;
  }

  duplicate(): void {
    this.rowsRead++;
    this.duplicates++;
  }

  keep(r: PremiumRow): void {
    this.rowsRead++;
    this.rowsKept++;
    this.years.set(r.year, (this.years.get(r.year) ?? 0) + 1);
    this.cantons.add(r.canton);
    this.insurers.add(r.insurerBag);
    this.tariffs.add(`${r.insurerBag}|${r.tariffCode}`);
    this.min = this.min === null ? r.monthlyPremiumRp : Math.min(this.min, r.monthlyPremiumRp);
    this.max = this.max === null ? r.monthlyPremiumRp : Math.max(this.max, r.monthlyPremiumRp);
    if (r.ageClass === "ADULT" && r.franchiseChf === 300 && !r.accident && r.subgroup === "E1") {
      const list = this.adultSamples.get(r.canton) ?? [];
      list.push(r.monthlyPremiumRp);
      this.adultSamples.set(r.canton, list);
    }
  }

  /**
   * @param previousMedians médianes adulte par canton du jeu de l'année précédente, pour
   *        signaler une variation invraisemblable (codes mal lus, mauvaise colonne).
   */
  report(missingColumns: string[], previousMedians: Record<string, Rappen> = {}): ValidationReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (missingColumns.length) errors.push(`Colonnes manquantes : ${missingColumns.join(", ")}.`);

    const years = [...this.years.entries()].sort((a, b) => b[1] - a[1]);
    const year = years[0]?.[0] ?? null;
    if (years.length > 1) {
      errors.push(`Le fichier mélange plusieurs années (${years.map(([y]) => y).join(", ")}).`);
    }
    if (this.rowsKept === 0 && missingColumns.length === 0) errors.push("Aucune ligne exploitable.");

    const missingCantons = CANTONS.filter((c) => !this.cantons.has(c));
    if (this.rowsKept > 0 && missingCantons.length) {
      warnings.push(`Cantons absents : ${missingCantons.join(", ")}.`);
    }
    const skippedTotal = Object.values(this.skipped).reduce((a, b) => a + (b ?? 0), 0);
    const illegible = skippedTotal - (this.skipped.hors_suisse ?? 0);
    if (this.rowsRead > 0 && illegible / this.rowsRead > 0.01) {
      warnings.push(`${illegible} lignes illisibles (${Math.round((illegible * 100) / this.rowsRead)} %) : le format a peut-être changé.`);
    }
    if (this.min !== null && this.min < 1000) warnings.push("Prime mensuelle inférieure à CHF 10 détectée.");
    if (this.max !== null && this.max > 200000) warnings.push("Prime mensuelle supérieure à CHF 2000 détectée.");

    const adultMedianByCanton: Record<string, Rappen> = {};
    for (const [canton, list] of this.adultSamples) {
      const sorted = list.sort((a, b) => a - b);
      adultMedianByCanton[canton] = sorted[Math.floor(sorted.length / 2)]!;
      const prev = previousMedians[canton];
      if (prev) {
        const change = (adultMedianByCanton[canton]! - prev) / prev;
        if (Math.abs(change) > 0.3) {
          warnings.push(`${canton} : médiane adulte ${change > 0 ? "+" : ""}${Math.round(change * 100)} % par rapport à l'année précédente.`);
        }
      }
    }

    return {
      ok: errors.length === 0,
      year,
      errors,
      warnings,
      stats: {
        rowsRead: this.rowsRead,
        rowsKept: this.rowsKept,
        duplicates: this.duplicates,
        skipped: this.skipped,
        cantons: this.cantons.size,
        insurers: this.insurers.size,
        tariffs: this.tariffs.size,
        minPremiumRp: this.min,
        maxPremiumRp: this.max,
        adultMedianByCanton,
      },
    };
  }
}
