import { and, asc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { MODEL_TYPES, CANTONS } from "@/domain/lamal";
import type { Db } from "@/infrastructure/db/client";
import { household, householdSetting, insurer, lamalPolicy, lcaPolicy, notificationLog, person } from "@/infrastructure/db/schema";
import { LCA_GUARANTEE_KEYS, guaranteeInfo } from "@/domain/lca";
import { UserError } from "./errors";
import { createHouseholdFor, householdIdOf, requireAdmin, ownedLca, ownedPerson, ownedPolicy, findPerson, type Scope } from "./scope";

/** Une personne seule ou un foyer de plusieurs membres : change le vocabulaire et l'accueil. */
export type HouseholdMode = "SOLO" | "FAMILY";

export function getHouseholdMode(db: Db, scope: Scope): HouseholdMode | null {
  if (scope.householdId === null) return null;
  const row = db
    .select()
    .from(householdSetting)
    .where(and(eq(householdSetting.householdId, scope.householdId), eq(householdSetting.key, "mode")))
    .get();
  return (row?.value as HouseholdMode | undefined) ?? null;
}

export function setHouseholdMode(db: Db, scope: Scope, mode: HouseholdMode) {
  if (mode !== "SOLO" && mode !== "FAMILY") throw new Error("Mode inconnu");
  const householdId = householdIdOf(scope);
  db.insert(householdSetting)
    .values({ householdId, key: "mode", value: mode })
    .onConflictDoUpdate({ target: [householdSetting.householdId, householdSetting.key], set: { value: mode } })
    .run();
}

export const householdInput = z.object({
  name: z.string().trim().default(""),
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

/**
 * Remise à zéro : efface tout ce que le foyer a saisi (foyer, personnes, contrats, rituels,
 * lettres, signatures, réglages). Les autres foyers, les primes officielles et les caisses restent.
 */
export function resetHousehold(db: Db, scope: Scope) {
  const householdId = householdIdOf(scope);
  db.transaction((tx) => {
    tx.delete(household).where(eq(household.id, householdId)).run();
    tx.delete(notificationLog).where(like(notificationLog.key, `h${householdId}:%`)).run();
  });
}

export function getHousehold(db: Db, scope: Scope) {
  if (scope.householdId === null) return null;
  return db.select().from(household).where(eq(household.id, scope.householdId)).get() ?? null;
}

/** Enregistre l'adresse du foyer, ou crée le foyer du compte s'il n'en a pas. Renvoie son identifiant. */
export function saveHousehold(db: Db, scope: Scope, input: z.input<typeof householdInput>): number {
  const data = householdInput.parse(input);
  if (scope.householdId === null) return createHouseholdFor(db, scope, data);
  db.update(household).set(data).where(eq(household.id, scope.householdId)).run();
  return scope.householdId;
}

/** Personnes d'un foyer ; `householdId` vient toujours du scope de l'appelant. */
export function listPersons(db: Db, householdId: number) {
  return db
    .select()
    .from(person)
    .where(eq(person.householdId, householdId))
    .orderBy(asc(person.sortOrder), asc(person.birthDate))
    .all();
}

export function getPerson(db: Db, scope: Scope, id: number) {
  return findPerson(db, scope, id);
}

export function savePerson(db: Db, scope: Scope, input: z.input<typeof personInput>) {
  const householdId = householdIdOf(scope);
  const { id, ...data } = personInput.parse(input);
  if (id) {
    ownedPerson(db, scope, id);
    db.update(person).set(data).where(and(eq(person.id, id), eq(person.householdId, householdId))).run();
    return id;
  }
  return db.insert(person).values({ ...data, householdId }).returning().get().id;
}

export function deletePerson(db: Db, scope: Scope, id: number) {
  ownedPerson(db, scope, id);
  db.delete(person).where(eq(person.id, id)).run();
}

/** Contrats d'une personne ; `personId` vient d'une personne déjà vérifiée (listPersons, getPerson). */
export function listPolicies(db: Db, personId: number) {
  return db
    .select({ policy: lamalPolicy, insurer })
    .from(lamalPolicy)
    .innerJoin(insurer, eq(lamalPolicy.insurerId, insurer.id))
    .where(eq(lamalPolicy.personId, personId))
    .orderBy(asc(lamalPolicy.coverageYear))
    .all();
}

export function savePolicy(db: Db, scope: Scope, input: z.input<typeof policyInput>, source: "MANUAL" | "OFSP" | "REVIEW" = "MANUAL") {
  const { id, ...data } = policyInput.parse(input);
  ownedPerson(db, scope, data.personId);
  if (!db.select({ id: insurer.id }).from(insurer).where(eq(insurer.id, data.insurerId)).get()) throw new UserError("Caisse inconnue.");
  const values = { ...data, modelType: data.modelType as never, source };
  if (id) {
    ownedPolicy(db, scope, id);
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

export function deletePolicy(db: Db, scope: Scope, id: number) {
  ownedPolicy(db, scope, id);
  db.delete(lamalPolicy).where(eq(lamalPolicy.id, id)).run();
}

/** Complémentaires d'une personne ; `personId` vient d'une personne déjà vérifiée. */
export function listLca(db: Db, personId: number) {
  return db.select().from(lcaPolicy).where(eq(lcaPolicy.personId, personId)).orderBy(asc(lcaPolicy.id)).all();
}

export function saveLca(db: Db, scope: Scope, input: z.input<typeof lcaInput>) {
  const { id, guarantee, productName, ...rest } = lcaInput.parse(input);
  ownedPerson(db, scope, rest.personId);
  const info = guaranteeInfo(guarantee)!;
  const data = { ...rest, guarantee, category: info.category, productName: productName || info.label };
  if (id) {
    ownedLca(db, scope, id);
    db.update(lcaPolicy).set(data).where(eq(lcaPolicy.id, id)).run();
    return id;
  }
  return db.insert(lcaPolicy).values(data).returning().get().id;
}

export function deleteLca(db: Db, scope: Scope, id: number) {
  ownedLca(db, scope, id);
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

/** Coordonnées d'une caisse : partagées par tous les foyers, donc réservées à l'administrateur. */
export function saveInsurer(db: Db, scope: Scope, input: z.input<typeof insurerInput>, nowIso: string) {
  requireAdmin(scope);
  const { id, ...data } = insurerInput.parse(input);
  db.update(insurer)
    .set({ ...data, addressVerifiedAt: data.terminationAddress ? nowIso : null })
    .where(eq(insurer.id, id))
    .run();
}
