import { desc, eq } from "drizzle-orm";
import { buildProfiles, type InsurerFigures, type InsurerProfile } from "@/domain/insurer-profile";
import type { AgeClass } from "@/domain/lamal";
import type { Db } from "@/infrastructure/db/client";
import { activeDataset, offersFor } from "@/infrastructure/db/queries";
import { insurer, insurerIndicator } from "@/infrastructure/db/schema";

export interface ProfileScope {
  canton: string;
  region: number;
  ageClass: AgeClass;
  accident: boolean;
  subgroup: string;
  targetYear: number;
}

/** Années de primes prises en compte pour l'évolution des tarifs. */
const TREND_YEARS = 5;

/**
 * Portraits des caisses pour un profil : comptes publiés les plus récents (OFSP) et évolution,
 * sur cinq ans au plus, de la prime du modèle standard à la franchise la plus basse dans la
 * région de l'assuré (une référence comparable d'une caisse à l'autre).
 */
export function insurerProfiles(db: Db, scope: ProfileScope): Map<number, InsurerProfile> {
  const latest = db.select({ year: insurerIndicator.year }).from(insurerIndicator).orderBy(desc(insurerIndicator.year)).get()?.year;
  const figures: InsurerFigures[] = latest
    ? db
        .select({
          insurerId: insurer.id,
          year: insurerIndicator.year,
          insured: insurerIndicator.insured,
          premiumPerInsuredRp: insurerIndicator.premiumPerInsuredRp,
          adminPerInsuredRp: insurerIndicator.adminPerInsuredRp,
          reservesPerInsuredRp: insurerIndicator.reservesPerInsuredRp,
        })
        .from(insurerIndicator)
        .innerJoin(insurer, eq(insurer.bagNumber, insurerIndicator.bagNumber))
        .where(eq(insurerIndicator.year, latest))
        .all()
    : [];

  const franchise = scope.ageClass === "KID" ? 0 : 300;
  const series = new Map<number, Map<number, number>>();
  for (let year = scope.targetYear - TREND_YEARS; year <= scope.targetYear; year++) {
    const ds = activeDataset(db, year);
    if (!ds) continue;
    const offers = offersFor(db, { datasetId: ds.id, canton: scope.canton, region: scope.region, ageClass: scope.ageClass, accident: scope.accident, subgroup: scope.subgroup });
    for (const o of offers) {
      if (o.modelType !== "STANDARD" || o.franchiseChf !== franchise) continue;
      const s = series.get(o.insurerId) ?? new Map<number, number>();
      const prev = s.get(year);
      if (prev === undefined || o.monthlyPremiumRp < prev) s.set(year, o.monthlyPremiumRp);
      series.set(o.insurerId, s);
    }
  }
  return buildProfiles(figures, series);
}
