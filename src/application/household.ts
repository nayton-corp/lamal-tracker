import { and, asc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { CANTONS, DEFAULT_HEALTH_COSTS_RP, DEFAULT_KID_SUBGROUP, MODEL_TYPES } from "@/domain/lamal";
import type { Db } from "@/infrastructure/db/client";
import { household, householdMember, householdSetting, insurer, lamalPolicy, lcaPolicy, notificationLog, person } from "@/infrastructure/db/schema";
import { audit } from "./audit";
import { LCA_GUARANTEE_KEYS, guaranteeInfo } from "@/domain/lca";
import { UserError } from "./errors";
import { createHouseholdFor, householdIdOf, requireAdmin, requireOwner, ownedLca, ownedPerson, ownedPolicy, findPerson, type Scope } from "./scope";

/*
 * Foyer : adresse (canton et région de primes), personnes, contrats LAMal par année et
 * complémentaires LCA. Tout objet désigné par son identifiant est vérifié par scope.ts.
 */

/** Une personne seule ou un foyer de plusieurs membres : change le vocabulaire et l'accueil. */
export type HouseholdMode = "SOLO" | "FAMILY";

/** Mode choisi à l'accueil ; null tant qu'il n'est pas choisi (ou sans foyer). */
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

/** Longueurs maximales des champs saisis : un texte de plusieurs Mo alourdirait chaque page et chaque PDF. */
const SHORT_TEXT = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = () => z.string().trim().max(SHORT_TEXT, `${SHORT_TEXT} caractères au plus`);

/** `region` : région de primes de la commune (0 à 3) ; `bfsNumber` : numéro OFS de la commune. */
export const householdInput = z.object({
  name: text().default(""),
  street: text().default(""),
  postalCode: text().default(""),
  city: text().default(""),
  commune: text().default(""),
  bfsNumber: z.coerce.number().int().positive().optional().nullable(),
  canton: z.enum(CANTONS),
  region: z.coerce.number().int().min(0).max(3),
});

export const personInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  firstName: text().min(1, "Prénom requis"),
  lastName: text().min(1, "Nom requis"),
  birthDate: z.string().regex(ISO_DATE, "Date au format AAAA-MM-JJ"),
  kidSubgroup: text().toUpperCase().default(DEFAULT_KID_SUBGROUP),
  employedAccidentCover: z.coerce.boolean().default(false),
  healthCostsRp: z.coerce.number().int().min(0).default(DEFAULT_HEALTH_COSTS_RP),
  allowedModels: z.array(z.enum(MODEL_TYPES as [string, ...string[]])).max(MODEL_TYPES.length).default([]),
  excludedInsurerIds: z.array(z.coerce.number().int()).max(100).default([]),
  doctorName: text().optional().nullable(),
});

export const policyInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  personId: z.coerce.number().int().positive(),
  coverageYear: z.coerce.number().int().min(2000).max(2100),
  insurerId: z.coerce.number().int().positive(),
  policyNumber: text().optional().nullable(),
  tariffCode: text().optional().nullable(),
  tariffLabel: text().optional().nullable(),
  modelType: z.enum(MODEL_TYPES as [string, ...string[]]),
  franchiseChf: z.coerce.number().int().min(0).max(5000),
  accident: z.coerce.boolean(),
  billedMonthlyRp: z.coerce.number().int().positive("Prime requise"),
});

export const lcaInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  personId: z.coerce.number().int().positive(),
  insurerName: text().min(1, "Assureur requis"),
  linkedInsurerId: z.coerce.number().int().positive().optional().nullable(),
  guarantee: z.enum(LCA_GUARANTEE_KEYS, { message: "Garantie requise" }),
  /** Nom commercial du produit ; à défaut, le libellé de la garantie. */
  productName: text().optional().nullable(),
  policyNumber: text().optional().nullable(),
  monthlyRp: z.coerce.number().int().min(0).optional().nullable(),
  minTermEnd: z.string().regex(ISO_DATE, "Date au format AAAA-MM-JJ").optional().nullable(),
  noticeMonths: z.coerce.number().int().min(0).max(24).optional().nullable(),
  active: z.coerce.boolean().default(true),
});

/**
 * Efface un foyer et tout ce qui en dépend (personnes, contrats, rituels, lettres, signatures,
 * réglages, clé de chiffrement). Les comptes de ses membres restent, sans foyer.
 */
export function eraseHousehold(db: Db, householdId: number) {
  db.transaction((tx) => {
    tx.delete(household).where(eq(household.id, householdId)).run();
    tx.delete(notificationLog).where(like(notificationLog.key, `h${householdId}:%`)).run();
  });
}

/**
 * Remise à zéro (suppression du foyer) : efface tout ce que le foyer a saisi. Les autres foyers,
 * les primes officielles et les caisses restent. Chaque membre en garde la trace dans son journal.
 */
export function resetHousehold(db: Db, scope: Scope, nowIso = new Date().toISOString()) {
  requireOwner(scope);
  const householdId = householdIdOf(scope);
  const members = db.select({ userId: householdMember.userId }).from(householdMember).where(eq(householdMember.householdId, householdId)).all();
  eraseHousehold(db, householdId);
  for (const m of members) audit(db, m.userId, "HOUSEHOLD_DELETED", { nowIso });
}

/** Foyer de l'appelant ; null tant que l'accueil ne l'a pas créé. */
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

/** Crée une personne, ou modifie celle désignée par `id` (qui doit appartenir au foyer). Renvoie son id. */
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

/** Supprime une personne ; ses contrats, complémentaires, signature et lignes de rituel partent avec (cascade). */
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

/**
 * Crée ou modifie un contrat LAMal. Sans `id`, un contrat existant de la même personne pour la
 * même année est remplacé (un seul par année). `source` : d'où vient le contrat (saisie, clôture…).
 */
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

/** Crée ou modifie une complémentaire ; la catégorie découle de la garantie choisie. */
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

/** Toutes les caisses (référentiel partagé), par raison sociale. */
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
