import { and, asc, desc, eq, lt } from "drizzle-orm";
import type { Db } from "./client";
import { household, lamalPolicy, lcaPolicy, lcaPremium, person, personPrefs } from "./schema";

export type HouseholdRow = typeof household.$inferSelect;
export type PersonRow = typeof person.$inferSelect;
export type PrefsRow = typeof personPrefs.$inferSelect;
export type LamalPolicyRow = typeof lamalPolicy.$inferSelect;
export type LcaPolicyRow = typeof lcaPolicy.$inferSelect;

export type HouseholdInput = Omit<HouseholdRow, "id" | "createdAt">;
export type PersonInput = Omit<PersonRow, "id" | "createdAt" | "householdId" | "active">;
export type LamalPolicyInput = Omit<LamalPolicyRow, "id" | "createdAt">;
export type LcaPolicyInput = Omit<LcaPolicyRow, "id" | "createdAt">;

/** L'application gère un seul foyer ; le modèle en permet plusieurs. */
export class HouseholdRepository {
  constructor(private readonly db: Db) {}

  household(): HouseholdRow | undefined {
    return this.db.select().from(household).orderBy(asc(household.id)).get();
  }

  saveHousehold(input: HouseholdInput): number {
    const existing = this.household();
    if (existing) {
      this.db.update(household).set(input).where(eq(household.id, existing.id)).run();
      return existing.id;
    }
    return this.db.insert(household).values(input).returning({ id: household.id }).get().id;
  }

  persons(householdId: number, includeInactive = false): PersonRow[] {
    const cond = includeInactive
      ? eq(person.householdId, householdId)
      : and(eq(person.householdId, householdId), eq(person.active, true));
    return this.db.select().from(person).where(cond).orderBy(asc(person.birthDate)).all();
  }

  person(id: number): PersonRow | undefined {
    return this.db.select().from(person).where(eq(person.id, id)).get();
  }

  createPerson(householdId: number, input: PersonInput): number {
    const id = this.db
      .insert(person)
      .values({ ...input, householdId })
      .returning({ id: person.id })
      .get().id;
    this.db.insert(personPrefs).values({ personId: id }).run();
    return id;
  }

  updatePerson(id: number, input: Partial<PersonInput> & { active?: boolean }): void {
    this.db.update(person).set(input).where(eq(person.id, id)).run();
  }

  deletePerson(id: number): void {
    this.db.delete(person).where(eq(person.id, id)).run();
  }

  prefs(personId: number): PrefsRow {
    const row = this.db.select().from(personPrefs).where(eq(personPrefs.personId, personId)).get();
    if (row) return row;
    this.db.insert(personPrefs).values({ personId }).run();
    return this.db.select().from(personPrefs).where(eq(personPrefs.personId, personId)).get()!;
  }

  savePrefs(personId: number, input: Partial<Omit<PrefsRow, "personId">>): void {
    this.prefs(personId);
    this.db.update(personPrefs).set(input).where(eq(personPrefs.personId, personId)).run();
  }

  policies(personId: number): LamalPolicyRow[] {
    return this.db.select().from(lamalPolicy).where(eq(lamalPolicy.personId, personId)).orderBy(desc(lamalPolicy.coverageYear)).all();
  }

  policy(id: number): LamalPolicyRow | undefined {
    return this.db.select().from(lamalPolicy).where(eq(lamalPolicy.id, id)).get();
  }

  policyFor(personId: number, year: number): LamalPolicyRow | undefined {
    return this.db
      .select()
      .from(lamalPolicy)
      .where(and(eq(lamalPolicy.personId, personId), eq(lamalPolicy.coverageYear, year)))
      .get();
  }

  /** Dernier contrat connu avant une année (si l'année précédente n'a pas été saisie). */
  latestPolicyBefore(personId: number, year: number): LamalPolicyRow | undefined {
    return this.db
      .select()
      .from(lamalPolicy)
      .where(and(eq(lamalPolicy.personId, personId), lt(lamalPolicy.coverageYear, year)))
      .orderBy(desc(lamalPolicy.coverageYear))
      .get();
  }

  savePolicy(input: LamalPolicyInput): number {
    const existing = this.policyFor(input.personId, input.coverageYear);
    if (existing) {
      this.db.update(lamalPolicy).set(input).where(eq(lamalPolicy.id, existing.id)).run();
      return existing.id;
    }
    return this.db.insert(lamalPolicy).values(input).returning({ id: lamalPolicy.id }).get().id;
  }

  deletePolicy(id: number): void {
    this.db.delete(lamalPolicy).where(eq(lamalPolicy.id, id)).run();
  }

  allPolicies(householdId: number): (LamalPolicyRow & { firstName: string })[] {
    return this.db
      .select({ policy: lamalPolicy, firstName: person.firstName })
      .from(lamalPolicy)
      .innerJoin(person, eq(person.id, lamalPolicy.personId))
      .where(eq(person.householdId, householdId))
      .orderBy(asc(lamalPolicy.coverageYear))
      .all()
      .map((r) => ({ ...r.policy, firstName: r.firstName }));
  }

  lcaPolicies(householdId: number): (LcaPolicyRow & { monthlyPremiumRp: number | null })[] {
    const rows = this.db
      .select({ lca: lcaPolicy })
      .from(lcaPolicy)
      .innerJoin(person, eq(person.id, lcaPolicy.personId))
      .where(eq(person.householdId, householdId))
      .orderBy(asc(lcaPolicy.personId), asc(lcaPolicy.productName))
      .all()
      .map((r) => r.lca);
    return rows.map((r) => ({ ...r, monthlyPremiumRp: this.latestLcaPremium(r.id) }));
  }

  lcaPolicy(id: number): LcaPolicyRow | undefined {
    return this.db.select().from(lcaPolicy).where(eq(lcaPolicy.id, id)).get();
  }

  saveLcaPolicy(id: number | null, input: LcaPolicyInput): number {
    if (id !== null) {
      this.db.update(lcaPolicy).set(input).where(eq(lcaPolicy.id, id)).run();
      return id;
    }
    return this.db.insert(lcaPolicy).values(input).returning({ id: lcaPolicy.id }).get().id;
  }

  deleteLcaPolicy(id: number): void {
    this.db.delete(lcaPolicy).where(eq(lcaPolicy.id, id)).run();
  }

  saveLcaPremium(lcaPolicyId: number, year: number, monthlyRp: number): void {
    this.db
      .insert(lcaPremium)
      .values({ lcaPolicyId, year, monthlyRp })
      .onConflictDoUpdate({ target: [lcaPremium.lcaPolicyId, lcaPremium.year], set: { monthlyRp } })
      .run();
  }

  lcaPremiums(lcaPolicyId: number) {
    return this.db.select().from(lcaPremium).where(eq(lcaPremium.lcaPolicyId, lcaPolicyId)).orderBy(asc(lcaPremium.year)).all();
  }

  private latestLcaPremium(lcaPolicyId: number): number | null {
    return (
      this.db
        .select()
        .from(lcaPremium)
        .where(eq(lcaPremium.lcaPolicyId, lcaPolicyId))
        .orderBy(desc(lcaPremium.year))
        .get()?.monthlyRp ?? null
    );
  }
}
