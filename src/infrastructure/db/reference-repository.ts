import { and, asc, desc, eq, lte } from "drizzle-orm";
import { defaultLamalParameters, type LamalParameters } from "@/domain/lamal-parameters";
import type { Db } from "./client";
import { co2Redistribution, insurer, insurerAddress, lamalParameters } from "./schema";

export type InsurerRow = typeof insurer.$inferSelect;
export type InsurerAddressRow = typeof insurerAddress.$inferSelect;

/** Référentiel modifiable : assureurs, adresses de résiliation, paramètres légaux, redistribution CO2. */
export class ReferenceRepository {
  constructor(private readonly db: Db) {}

  insurers(): InsurerRow[] {
    return this.db.select().from(insurer).orderBy(asc(insurer.name)).all();
  }

  insurer(id: number): InsurerRow | undefined {
    return this.db.select().from(insurer).where(eq(insurer.id, id)).get();
  }

  upsertInsurer(id: number, name: string, source: InsurerRow["nameSource"], website: string | null = null): void {
    this.db
      .insert(insurer)
      .values({ id, name, nameSource: source, website })
      .onConflictDoUpdate({ target: insurer.id, set: { name, nameSource: source, website } })
      .run();
  }

  /** Ajoute les noms connus sans écraser ceux saisis par l'utilisateur. */
  seedInsurers(seed: readonly { id: number; name: string }[]): void {
    for (const s of seed) {
      const existing = this.insurer(s.id);
      if (!existing) this.db.insert(insurer).values({ id: s.id, name: s.name, nameSource: "SEED" }).run();
      else if (existing.nameSource === "UNKNOWN") {
        this.db.update(insurer).set({ name: s.name, nameSource: "SEED" }).where(eq(insurer.id, s.id)).run();
      }
    }
  }

  /** Adresse de résiliation valable pour une année (la plus récente dont validFromYear ≤ année). */
  terminationAddress(insurerId: number, year: number): InsurerAddressRow | undefined {
    return this.db
      .select()
      .from(insurerAddress)
      .where(and(eq(insurerAddress.insurerId, insurerId), lte(insurerAddress.validFromYear, year)))
      .orderBy(desc(insurerAddress.validFromYear))
      .get();
  }

  addresses(insurerId: number): InsurerAddressRow[] {
    return this.db.select().from(insurerAddress).where(eq(insurerAddress.insurerId, insurerId)).orderBy(desc(insurerAddress.validFromYear)).all();
  }

  saveAddress(row: InsurerAddressRow): void {
    this.db
      .insert(insurerAddress)
      .values(row)
      .onConflictDoUpdate({
        target: [insurerAddress.insurerId, insurerAddress.validFromYear],
        set: { recipientName: row.recipientName, addressLines: row.addressLines, source: row.source, verifiedAt: row.verifiedAt },
      })
      .run();
  }

  parameters(year: number): LamalParameters & { isDefault: boolean } {
    const row = this.db.select().from(lamalParameters).where(eq(lamalParameters.year, year)).get();
    if (!row) return { ...defaultLamalParameters(year), isDefault: true };
    return { ...row, isDefault: false };
  }

  saveParameters(params: LamalParameters): void {
    const { year, ...rest } = params;
    this.db
      .insert(lamalParameters)
      .values({ year, ...rest })
      .onConflictDoUpdate({ target: lamalParameters.year, set: rest })
      .run();
  }

  co2(year: number): { annualAmountRp: number; sourceNote: string | null } | null {
    const row = this.db.select().from(co2Redistribution).where(eq(co2Redistribution.year, year)).get();
    return row ? { annualAmountRp: row.annualAmountRp, sourceNote: row.sourceNote } : null;
  }

  co2All() {
    return this.db.select().from(co2Redistribution).orderBy(desc(co2Redistribution.year)).all();
  }

  saveCo2(year: number, annualAmountRp: number | null, sourceNote: string | null): void {
    if (annualAmountRp === null) {
      this.db.delete(co2Redistribution).where(eq(co2Redistribution.year, year)).run();
      return;
    }
    this.db
      .insert(co2Redistribution)
      .values({ year, annualAmountRp, sourceNote })
      .onConflictDoUpdate({ target: co2Redistribution.year, set: { annualAmountRp, sourceNote } })
      .run();
  }
}
