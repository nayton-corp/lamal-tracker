import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { MODEL_TYPES, CANTONS } from "@/domain/lamal";
import type { Db } from "@/infrastructure/db/client";
import { household, insurer, lamalPolicy, lcaPolicy, person } from "@/infrastructure/db/schema";
import { LCA_GUARANTEE_KEYS, guaranteeInfo } from "@/domain/lca";
import { getSetting, setSetting } from "@/infrastructure/db/settings";

/** Une personne seule ou un foyer de plusieurs membres : change le vocabulaire et l'accueil. */
export type HouseholdMode = "SOLO" | "FAMILY";

export function getHouseholdMode(db: Db): HouseholdMode | null {
  return getSetting<HouseholdMode>(db, "household.mode");
}

export function setHouseholdMode(db: Db, mode: HouseholdMode) {
  if (mode !== "SOLO" && mode !== "FAMILY") throw new Error("Mode inconnu");
  setSetting(db, "household.mode", mode);
}

export const householdInput = z.object({
  name: z.string().trim().min(1, "Nom requis"),
  street: z.string().trim().default(""),
  postalCode: z.string().trim().default(""),
  city: z.string().trim().default(""),
  commune: z.string().trim().default(""),
  bfsNumber: z.coerce.number().int().positive().optional().nullable(),
  canton: z.enum(CANTONS),
  region: z.coerce.number().int().min(0).max(3),
});

export const personInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  firstName: z.string().trim().min(1, "Prénom requis"),
  lastName: z.string().trim().min(1, "Nom requis"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format AAAA-MM-JJ"),
  kidSubgroup: z.string().trim().toUpperCase().default("K1"),
  employedAccidentCover: z.coerce.boolean().default(false),
  healthCostsRp: z.coerce.number().int().min(0).default(50000),
  allowedModels: z.array(z.enum(MODEL_TYPES as [string, ...string[]])).default([]),
  excludedInsurerIds: z.array(z.coerce.number().int()).default([]),
  doctorName: z.string().trim().optional().nullable(),
});

export const policyInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  personId: z.coerce.number().int().positive(),
  coverageYear: z.coerce.number().int().min(2000).max(2100),
  insurerId: z.coerce.number().int().positive(),
  policyNumber: z.string().trim().optional().nullable(),
  tariffCode: z.string().trim().optional().nullable(),
  tariffLabel: z.string().trim().optional().nullable(),
  modelType: z.enum(MODEL_TYPES as [string, ...string[]]),
  franchiseChf: z.coerce.number().int().min(0).max(5000),
  accident: z.coerce.boolean(),
  billedMonthlyRp: z.coerce.number().int().positive("Prime requise"),
});

export const lcaInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  personId: z.coerce.number().int().positive(),
  insurerName: z.string().trim().min(1, "Assureur requis"),
  linkedInsurerId: z.coerce.number().int().positive().optional().nullable(),
  guarantee: z.enum(LCA_GUARANTEE_KEYS, { message: "Garantie requise" }),
  /** Nom commercial du produit ; à défaut, le libellé de la garantie. */
  productName: z.string().trim().optional().nullable(),
  policyNumber: z.string().trim().optional().nullable(),
  monthlyRp: z.coerce.number().int().min(0).optional().nullable(),
  minTermEnd: z.string().optional().nullable(),
  noticeMonths: z.coerce.number().int().min(0).max(24).optional().nullable(),
  active: z.coerce.boolean().default(true),
});

export function getHousehold(db: Db) {
  return db.select().from(household).orderBy(asc(household.id)).get() ?? null;
}

export function saveHousehold(db: Db, input: z.input<typeof householdInput>) {
  const data = householdInput.parse(input);
  const existing = getHousehold(db);
  if (existing) {
    db.update(household).set(data).where(eq(household.id, existing.id)).run();
    return existing.id;
  }
  return db.insert(household).values(data).returning().get().id;
}

export function listPersons(db: Db, householdId: number) {
  return db
    .select()
    .from(person)
    .where(eq(person.householdId, householdId))
    .orderBy(asc(person.sortOrder), asc(person.birthDate))
    .all();
}

export function getPerson(db: Db, id: number) {
  return db.select().from(person).where(eq(person.id, id)).get() ?? null;
}

export function savePerson(db: Db, householdId: number, input: z.input<typeof personInput>) {
  const { id, ...data } = personInput.parse(input);
  if (id) {
    db.update(person).set(data).where(eq(person.id, id)).run();
    return id;
  }
  return db.insert(person).values({ ...data, householdId }).returning().get().id;
}

export function deletePerson(db: Db, id: number) {
  db.delete(person).where(eq(person.id, id)).run();
}

export function listPolicies(db: Db, personId: number) {
  return db
    .select({ policy: lamalPolicy, insurer })
    .from(lamalPolicy)
    .innerJoin(insurer, eq(lamalPolicy.insurerId, insurer.id))
    .where(eq(lamalPolicy.personId, personId))
    .orderBy(asc(lamalPolicy.coverageYear))
    .all();
}

export function savePolicy(db: Db, input: z.input<typeof policyInput>, source: "MANUAL" | "OFSP" | "REVIEW" = "MANUAL") {
  const { id, ...data } = policyInput.parse(input);
  const values = { ...data, modelType: data.modelType as never, source };
  if (id) {
    db.update(lamalPolicy).set(values).where(eq(lamalPolicy.id, id)).run();
    return id;
  }
  return db
    .insert(lamalPolicy)
    .values(values)
    .onConflictDoUpdate({ target: [lamalPolicy.personId, lamalPolicy.coverageYear], set: values })
    .returning()
    .get().id;
}

export function deletePolicy(db: Db, id: number) {
  db.delete(lamalPolicy).where(eq(lamalPolicy.id, id)).run();
}

export function listLca(db: Db, personId: number) {
  return db.select().from(lcaPolicy).where(eq(lcaPolicy.personId, personId)).orderBy(asc(lcaPolicy.id)).all();
}

export function saveLca(db: Db, input: z.input<typeof lcaInput>) {
  const { id, guarantee, productName, ...rest } = lcaInput.parse(input);
  const info = guaranteeInfo(guarantee)!;
  const data = { ...rest, guarantee, category: info.category, productName: productName || info.label };
  if (id) {
    db.update(lcaPolicy).set(data).where(eq(lcaPolicy.id, id)).run();
    return id;
  }
  return db.insert(lcaPolicy).values(data).returning().get().id;
}

export function deleteLca(db: Db, id: number) {
  db.delete(lcaPolicy).where(eq(lcaPolicy.id, id)).run();
}

export function listInsurers(db: Db) {
  return db.select().from(insurer).orderBy(asc(insurer.name)).all();
}

export const insurerInput = z.object({
  id: z.coerce.number().int().positive(),
  displayName: z.string().trim().optional().nullable(),
  terminationAddress: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
});

export function saveInsurer(db: Db, input: z.input<typeof insurerInput>, nowIso: string) {
  const { id, ...data } = insurerInput.parse(input);
  db.update(insurer)
    .set({ ...data, addressVerifiedAt: data.terminationAddress ? nowIso : null })
    .where(eq(insurer.id, id))
    .run();
}
