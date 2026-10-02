import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AgeClass } from "@/domain/age-class";
import type { ModelType } from "@/domain/insurance-model";
import type { Tariff } from "@/domain/tariff";
import type { Db } from "./client";
import { insurer, modelOverride, premiumTariff, tariffDataset, tariffLineage } from "./schema";

export type DatasetStatus = "STAGING" | "ACTIVE" | "SUPERSEDED" | "DISCARDED";
export type DatasetRow = typeof tariffDataset.$inferSelect;

export interface TariffInsert {
  insurerId: number;
  canton: string;
  region: number;
  ageClass: AgeClass;
  ageSubgroup: string;
  accidentIncluded: boolean;
  modelType: ModelType;
  tariffTypeRaw: string;
  tariffCode: string;
  tariffLabel: string;
  franchiseChf: number;
  monthlyPremiumRp: number;
}

const tariffColumns = sql`
  t.id AS id, t.dataset_id AS datasetId, d.year AS year, t.insurer_id AS insurerId,
  COALESCE(i.name, 'Assureur n° ' || t.insurer_id) AS insurerName, t.canton AS canton, t.region AS region,
  t.age_class AS ageClass, t.age_subgroup AS ageSubgroup, t.accident_included AS accidentIncluded,
  COALESCE(o.model_type, t.model_type) AS modelType, t.tariff_code AS tariffCode, t.tariff_label AS tariffLabel,
  t.franchise_chf AS franchiseChf, t.monthly_premium_rp AS monthlyPremiumRp`;

const tariffFrom = sql`
  FROM premium_tariff t
  JOIN tariff_dataset d ON d.id = t.dataset_id
  LEFT JOIN insurer i ON i.id = t.insurer_id
  LEFT JOIN model_override o ON o.insurer_id = t.insurer_id AND o.tariff_code = t.tariff_code`;

type RawTariff = Omit<Tariff, "accidentIncluded"> & { accidentIncluded: number };

function toTariff(r: RawTariff): Tariff {
  return { ...r, accidentIncluded: r.accidentIncluded === 1 };
}

export class TariffRepository {
  constructor(private readonly db: Db) {}

  findDatasetBySha(sha: string): DatasetRow | undefined {
    return this.db.select().from(tariffDataset).where(eq(tariffDataset.fileSha256, sha)).get();
  }

  getDataset(id: number): DatasetRow | undefined {
    return this.db.select().from(tariffDataset).where(eq(tariffDataset.id, id)).get();
  }

  listDatasets(): DatasetRow[] {
    return this.db.select().from(tariffDataset).orderBy(desc(tariffDataset.year), desc(tariffDataset.id)).all();
  }

  activeDataset(year: number): DatasetRow | undefined {
    return this.db
      .select()
      .from(tariffDataset)
      .where(and(eq(tariffDataset.year, year), eq(tariffDataset.status, "ACTIVE")))
      .get();
  }

  activeYears(): number[] {
    return this.db
      .select({ year: tariffDataset.year })
      .from(tariffDataset)
      .where(eq(tariffDataset.status, "ACTIVE"))
      .orderBy(tariffDataset.year)
      .all()
      .map((r) => r.year);
  }

  createDataset(meta: {
    year: number;
    sourceLabel: string;
    sourceUrl: string | null;
    fileName: string;
    fileSha256: string;
    parserVersion: string;
  }): number {
    const row = this.db
      .insert(tariffDataset)
      .values({ ...meta, rowCount: 0, status: "STAGING", validationReport: {} })
      .returning({ id: tariffDataset.id })
      .get();
    return row.id;
  }

  /** Insertion en masse dans une transaction, avec dédoublonnage sur la clé métier. Retourne le nombre inséré. */
  insertTariffs(datasetId: number, rows: Iterable<TariffInsert>, onDuplicate: () => void): number {
    const sqlite = this.db.$client;
    const stmt = sqlite.prepare(
      `INSERT INTO premium_tariff (dataset_id, insurer_id, canton, region, age_class, age_subgroup, accident_included,
         model_type, tariff_type_raw, tariff_code, tariff_label, franchise_chf, monthly_premium_rp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const seen = new Set<string>();
    let inserted = 0;
    sqlite.transaction(() => {
      for (const r of rows) {
        const key = `${r.insurerId}|${r.canton}|${r.region}|${r.ageClass}|${r.ageSubgroup}|${r.accidentIncluded ? 1 : 0}|${r.tariffCode}|${r.franchiseChf}`;
        if (seen.has(key)) {
          onDuplicate();
          continue;
        }
        seen.add(key);
        stmt.run(
          datasetId,
          r.insurerId,
          r.canton,
          r.region,
          r.ageClass,
          r.ageSubgroup,
          r.accidentIncluded ? 1 : 0,
          r.modelType,
          r.tariffTypeRaw,
          r.tariffCode,
          r.tariffLabel,
          r.franchiseChf,
          r.monthlyPremiumRp,
        );
        inserted += 1;
      }
    })();
    return inserted;
  }

  finishDataset(id: number, rowCount: number, report: unknown): void {
    this.db.update(tariffDataset).set({ rowCount, validationReport: report }).where(eq(tariffDataset.id, id)).run();
  }

  /** Active un jeu et remplace l'éventuel jeu actif de la même année. */
  activateDataset(id: number, nowIso: string): void {
    const ds = this.getDataset(id);
    if (!ds) throw new Error("Jeu de données introuvable.");
    this.db.transaction((tx) => {
      tx.update(tariffDataset)
        .set({ status: "SUPERSEDED" })
        .where(and(eq(tariffDataset.year, ds.year), eq(tariffDataset.status, "ACTIVE")))
        .run();
      tx.update(tariffDataset).set({ status: "ACTIVE", activatedAt: nowIso }).where(eq(tariffDataset.id, id)).run();
    });
  }

  /** Abandonne un jeu en attente : ses lignes sont supprimées, la trace de l'import reste. */
  discardDataset(id: number): void {
    this.db.transaction((tx) => {
      tx.delete(premiumTariff).where(eq(premiumTariff.datasetId, id)).run();
      tx.update(tariffDataset).set({ status: "DISCARDED" }).where(eq(tariffDataset.id, id)).run();
    });
  }

  deleteDatasetCompletely(id: number): void {
    this.db.delete(tariffDataset).where(eq(tariffDataset.id, id)).run();
  }

  tariffs(filter: {
    datasetId: number;
    canton: string;
    region: number;
    ageClass?: AgeClass;
    accidentIncluded?: boolean;
    insurerId?: number;
  }): Tariff[] {
    const conds = [sql`t.dataset_id = ${filter.datasetId}`, sql`t.canton = ${filter.canton}`, sql`t.region = ${filter.region}`];
    if (filter.ageClass) conds.push(sql`t.age_class = ${filter.ageClass}`);
    if (filter.accidentIncluded !== undefined) conds.push(sql`t.accident_included = ${filter.accidentIncluded ? 1 : 0}`);
    if (filter.insurerId !== undefined) conds.push(sql`t.insurer_id = ${filter.insurerId}`);
    const rows = this.db.all<RawTariff>(sql`SELECT ${tariffColumns} ${tariffFrom} WHERE ${sql.join(conds, sql` AND `)}`);
    return rows.map(toTariff);
  }

  tariffById(id: number): Tariff | undefined {
    const row = this.db.get<RawTariff>(sql`SELECT ${tariffColumns} ${tariffFrom} WHERE t.id = ${id}`);
    return row ? toTariff(row) : undefined;
  }

  tariffsByIds(ids: number[]): Tariff[] {
    if (ids.length === 0) return [];
    return this.db
      .all<RawTariff>(
        sql`SELECT ${tariffColumns} ${tariffFrom} WHERE t.id IN ${sql`(${sql.join(
          ids.map((i) => sql`${i}`),
          sql`, `,
        )})`}`,
      )
      .map(toTariff);
  }

  regions(datasetId: number, canton: string): number[] {
    return this.db
      .all<{ region: number }>(sql`SELECT DISTINCT region FROM premium_tariff WHERE dataset_id = ${datasetId} AND canton = ${canton} ORDER BY region`)
      .map((r) => r.region);
  }

  /** Sous-groupe d'âge principal (le plus petit, « » s'il existe). */
  defaultSubgroup(datasetId: number, ageClass: AgeClass): string {
    const row = this.db.get<{ s: string | null }>(
      sql`SELECT MIN(age_subgroup) AS s FROM premium_tariff WHERE dataset_id = ${datasetId} AND age_class = ${ageClass}`,
    );
    return row?.s ?? "";
  }

  insurerIds(datasetId: number): number[] {
    return this.db.all<{ id: number }>(sql`SELECT DISTINCT insurer_id AS id FROM premium_tariff WHERE dataset_id = ${datasetId}`).map((r) => r.id);
  }

  /** Statistiques de contrôle d'un import. */
  stats(datasetId: number) {
    const byCanton = this.db.all<{ canton: string; n: number }>(
      sql`SELECT canton, COUNT(*) AS n FROM premium_tariff WHERE dataset_id = ${datasetId} GROUP BY canton ORDER BY canton`,
    );
    const byModel = this.db.all<{ model: string; n: number }>(
      sql`SELECT model_type AS model, COUNT(*) AS n FROM premium_tariff WHERE dataset_id = ${datasetId} GROUP BY model_type`,
    );
    const insurers = this.db.get<{ n: number }>(sql`SELECT COUNT(DISTINCT insurer_id) AS n FROM premium_tariff WHERE dataset_id = ${datasetId}`);
    const withoutStandard = this.db.all<{ id: number }>(sql`
      SELECT DISTINCT insurer_id AS id FROM premium_tariff WHERE dataset_id = ${datasetId}
      EXCEPT SELECT DISTINCT insurer_id FROM premium_tariff WHERE dataset_id = ${datasetId} AND model_type = 'STANDARD'`);
    const outOfBounds = this.db.all<{ id: number; insurerId: number; canton: string; ageClass: string; franchise: number; premium: number }>(sql`
      SELECT id, insurer_id AS insurerId, canton, age_class AS ageClass, franchise_chf AS franchise, monthly_premium_rp AS premium
      FROM premium_tariff WHERE dataset_id = ${datasetId} AND (
        (age_class = 'KID' AND (monthly_premium_rp < 1000 OR monthly_premium_rp > 60000)) OR
        (age_class <> 'KID' AND (monthly_premium_rp < 5000 OR monthly_premium_rp > 250000)))
      LIMIT 200`);
    const subgroups = this.db.all<{ ageClass: string; subgroup: string; n: number }>(sql`
      SELECT age_class AS ageClass, age_subgroup AS subgroup, COUNT(*) AS n FROM premium_tariff
      WHERE dataset_id = ${datasetId} GROUP BY age_class, age_subgroup`);
    return {
      byCanton,
      byModel,
      insurerCount: insurers?.n ?? 0,
      insurersWithoutStandard: withoutStandard.map((r) => r.id),
      outOfBounds,
      subgroups,
    };
  }

  /**
   * Comparaison avec l'année précédente sur un profil de référence (adulte, franchise 300, sans accident) :
   * médiane des variations par canton et produits dont la prime varie de plus de ±30 %.
   */
  yearOverYear(datasetId: number, previousDatasetId: number) {
    const rows = this.db.all<{
      insurerId: number;
      tariffCode: string;
      canton: string;
      region: number;
      fromRp: number;
      toRp: number;
    }>(sql`
      SELECT n.insurer_id AS insurerId, n.tariff_code AS tariffCode, n.canton AS canton, n.region AS region,
             p.monthly_premium_rp AS fromRp, n.monthly_premium_rp AS toRp
      FROM premium_tariff n
      JOIN premium_tariff p ON p.dataset_id = ${previousDatasetId} AND p.insurer_id = n.insurer_id
        AND p.tariff_code = n.tariff_code AND p.canton = n.canton AND p.region = n.region
        AND p.age_class = n.age_class AND p.age_subgroup = n.age_subgroup
        AND p.accident_included = n.accident_included AND p.franchise_chf = n.franchise_chf
      WHERE n.dataset_id = ${datasetId} AND n.age_class = 'ADULT' AND n.accident_included = 0 AND n.franchise_chf = 300`);
    return rows;
  }

  /** Médiane du marché (primes) par année pour un profil donné, sur les jeux actifs. */
  marketByYear(profile: { canton: string; region: number; ageClass: AgeClass; franchiseChf: number; accidentIncluded: boolean }) {
    return this.db.all<{ year: number; premium: number }>(sql`
      SELECT d.year AS year, t.monthly_premium_rp AS premium
      FROM premium_tariff t JOIN tariff_dataset d ON d.id = t.dataset_id
      WHERE d.status = 'ACTIVE' AND t.canton = ${profile.canton} AND t.region = ${profile.region}
        AND t.age_class = ${profile.ageClass} AND t.franchise_chf = ${profile.franchiseChf}
        AND t.accident_included = ${profile.accidentIncluded ? 1 : 0}
        AND t.age_subgroup = (SELECT MIN(age_subgroup) FROM premium_tariff x WHERE x.dataset_id = t.dataset_id AND x.age_class = t.age_class)
      ORDER BY d.year`);
  }

  lineageMap(insurerIds: number[], fromYear: number, toYear: number): Map<string, string> {
    if (insurerIds.length === 0) return new Map();
    const rows = this.db
      .select()
      .from(tariffLineage)
      .where(
        and(
          inArray(tariffLineage.insurerId, insurerIds),
          eq(tariffLineage.fromYear, fromYear),
          eq(tariffLineage.toYear, toYear),
          eq(tariffLineage.confirmed, true),
        ),
      )
      .all();
    return new Map(rows.map((r) => [`${r.insurerId}:${r.fromCode}`, r.toCode]));
  }

  confirmLineage(insurerId: number, fromYear: number, fromCode: string, toYear: number, toCode: string): void {
    this.db
      .insert(tariffLineage)
      .values({ insurerId, fromYear, fromCode, toYear, toCode, confirmed: true })
      .onConflictDoUpdate({
        target: [tariffLineage.insurerId, tariffLineage.fromYear, tariffLineage.fromCode, tariffLineage.toYear],
        set: { toCode, confirmed: true },
      })
      .run();
  }

  setModelOverride(insurerId: number, tariffCode: string, modelType: ModelType): void {
    this.db
      .insert(modelOverride)
      .values({ insurerId, tariffCode, modelType })
      .onConflictDoUpdate({ target: [modelOverride.insurerId, modelOverride.tariffCode], set: { modelType } })
      .run();
  }

  /** Produits distincts d'un jeu pour une région (pour corriger la classification des modèles). */
  products(datasetId: number, canton: string, region: number) {
    return this.db.all<{
      insurerId: number;
      insurerName: string;
      tariffCode: string;
      tariffLabel: string;
      modelType: ModelType;
      rawType: string;
      overridden: number;
    }>(sql`
      SELECT t.insurer_id AS insurerId, COALESCE(i.name, 'Assureur n° ' || t.insurer_id) AS insurerName,
             t.tariff_code AS tariffCode, MIN(t.tariff_label) AS tariffLabel,
             COALESCE(o.model_type, MIN(t.model_type)) AS modelType, MIN(t.tariff_type_raw) AS rawType,
             o.model_type IS NOT NULL AS overridden
      FROM premium_tariff t
      LEFT JOIN insurer i ON i.id = t.insurer_id
      LEFT JOIN model_override o ON o.insurer_id = t.insurer_id AND o.tariff_code = t.tariff_code
      WHERE t.dataset_id = ${datasetId} AND t.canton = ${canton} AND t.region = ${region}
      GROUP BY t.insurer_id, t.tariff_code ORDER BY insurerName, t.tariff_code`);
  }

  ensureInsurers(ids: number[], names: Map<number, string>): void {
    const sqlite = this.db.$client;
    const insert = sqlite.prepare(
      `INSERT INTO insurer (id, name, name_source) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, name_source = excluded.name_source
       WHERE insurer.name_source IN ('UNKNOWN') AND excluded.name_source = 'DATASET'`,
    );
    sqlite.transaction(() => {
      for (const id of ids) {
        const name = names.get(id);
        insert.run(id, name ?? `Assureur n° ${id}`, name ? "DATASET" : "UNKNOWN");
      }
    })();
  }

  countTariffs(datasetId: number): number {
    return this.db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM premium_tariff WHERE dataset_id = ${datasetId}`)?.n ?? 0;
  }

  insurerName(id: number): string {
    return this.db.select({ name: insurer.name }).from(insurer).where(eq(insurer.id, id)).get()?.name ?? `Assureur n° ${id}`;
  }
}
