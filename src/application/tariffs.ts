import { and, asc, eq } from "drizzle-orm";
import { ageClassForYear } from "@/domain/age";
import { defaultSubgroup, type ModelType } from "@/domain/lamal";
import { franchisesFor } from "@/domain/parameters";
import type { Db } from "@/infrastructure/db/client";
import { activeDataset, parametersFor } from "@/infrastructure/db/queries";
import { premium, tariff } from "@/infrastructure/db/schema";
import { getHousehold, getPerson } from "./household";
import type { Scope } from "./scope";

export interface TariffOption {
  code: string;
  label: string;
  modelType: ModelType;
  /** franchise → [prime sans accident, prime avec accident] en centimes */
  premiums: Record<number, [number | null, number | null]>;
}

export interface TariffOptions {
  available: boolean;
  franchises: number[];
  tariffs: TariffOption[];
}

/** Tarifs d'un assureur pour une personne et une année, pour pré-remplir un contrat. */
export function tariffOptions(db: Db, scope: Scope, personId: number, year: number, insurerId: number): TariffOptions {
  const p = getPerson(db, scope, personId);
  const h = getHousehold(db, scope);
  const ageClass = p ? ageClassForYear(p.birthDate, year) : "ADULT";
  const franchises = franchisesFor(parametersFor(db, year), ageClass);
  const ds = activeDataset(db, year);
  if (!p || !h || !ds) return { available: false, franchises, tariffs: [] };
  const subgroup = ageClass === "KID" ? p.kidSubgroup : defaultSubgroup(ageClass);
  const rows = db
    .select({ code: tariff.code, label: tariff.label, modelType: tariff.modelType, franchise: premium.franchiseChf, accident: premium.accident, monthly: premium.monthlyRp })
    .from(premium)
    .innerJoin(tariff, eq(premium.tariffId, tariff.id))
    .where(
      and(
        eq(premium.datasetId, ds.id),
        eq(tariff.insurerId, insurerId),
        eq(premium.canton, h.canton),
        eq(premium.region, h.region),
        eq(premium.ageClass, ageClass),
        eq(premium.subgroup, subgroup),
      ),
    )
    .orderBy(asc(tariff.label))
    .all();
  const byCode = new Map<string, TariffOption>();
  for (const r of rows) {
    const opt = byCode.get(r.code) ?? { code: r.code, label: r.label, modelType: r.modelType as ModelType, premiums: {} };
    const pair = opt.premiums[r.franchise] ?? [null, null];
    pair[r.accident ? 1 : 0] = r.monthly;
    opt.premiums[r.franchise] = pair;
    byCode.set(r.code, opt);
  }
  // Le tarif standard d'abord, puis les modèles alternatifs par nom.
  const tariffs = [...byCode.values()].sort(
    (a, b) => Number(b.modelType === "STANDARD") - Number(a.modelType === "STANDARD") || a.label.localeCompare(b.label, "fr"),
  );
  return { available: true, franchises, tariffs };
}
