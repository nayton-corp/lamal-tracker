import { z } from "zod";
import { ageClassFor } from "@/domain/age-class";
import { isIsoDate } from "@/domain/calendar";
import { matchPolicyToTariff, type MatchConfidence } from "@/domain/comparison/renewal";
import { MODEL_TYPES, type ModelType } from "@/domain/insurance-model";
import { LCA_CATEGORIES } from "@/domain/lca";
import { CANTONS } from "@/domain/tariff";
import type { Tariff } from "@/domain/tariff";
import type { AppContext } from "./context";

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  throw new ValidationError(Object.values(fieldErrors)[0] ?? "Données invalides.", fieldErrors);
}

const isoDate = z.string().refine(isIsoDate, "Date invalide (AAAA-MM-JJ).");
const optionalIsoDate = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isIsoDate(v), "Date invalide (AAAA-MM-JJ).");

export const householdSchema = z.object({
  name: z.string().trim().min(1, "Nom du foyer requis."),
  street: z.string().trim().default(""),
  npa: z.string().trim().regex(/^(\d{4})?$/, "NPA à 4 chiffres."),
  locality: z.string().trim().default(""),
  canton: z.enum(CANTONS, { message: "Canton requis." }),
  region: z.coerce.number().int().min(0).max(3),
  representativePersonId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
});

export function saveHousehold(ctx: AppContext, input: unknown): number {
  const data = parse(householdSchema, input);
  return ctx.household.saveHousehold(data);
}

export function requireHousehold(ctx: AppContext) {
  const h = ctx.household.household();
  if (!h) throw new ValidationError("Configure d'abord ton foyer.");
  return h;
}

export const personSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis."),
  lastName: z.string().trim().min(1, "Nom requis."),
  birthDate: isoDate.refine((d) => d >= "1900-01-01", "Date de naissance invalide."),
});

export function createPerson(ctx: AppContext, input: unknown): number {
  const h = requireHousehold(ctx);
  const data = parse(personSchema, input);
  if (data.birthDate > ctx.clock.today()) throw new ValidationError("La date de naissance est dans le futur.");
  const id = ctx.household.createPerson(h.id, data);
  if (!h.representativePersonId && ageClassFor(data.birthDate, Number(ctx.clock.today().slice(0, 4))) !== "KID") {
    ctx.household.saveHousehold({ ...h, representativePersonId: id });
  }
  return id;
}

export function updatePerson(ctx: AppContext, id: number, input: unknown): void {
  const data = parse(personSchema, input);
  ctx.household.updatePerson(id, data);
}

export const prefsSchema = z.object({
  allowedModels: z.array(z.enum(MODEL_TYPES)).default([]),
  allowedFranchises: z.array(z.coerce.number().int().min(0)).default([]),
  expectedHealthCostsRp: z.coerce.number().int().min(0).max(100_000_00),
  accidentIncluded: z.coerce.boolean(),
  doctorName: z.string().trim().default(""),
  excludedInsurers: z.array(z.coerce.number().int().positive()).default([]),
});

export function savePrefs(ctx: AppContext, personId: number, input: unknown): void {
  ctx.household.savePrefs(personId, parse(prefsSchema, input));
}

export const policySchema = z.object({
  personId: z.coerce.number().int().positive(),
  coverageYear: z.coerce.number().int().min(1996).max(2100),
  insurerId: z.coerce.number().int().positive("Choisis une caisse."),
  policyNumber: z.string().trim().default(""),
  modelType: z.enum(MODEL_TYPES),
  franchiseChf: z.coerce.number().int().min(0),
  accidentIncluded: z.coerce.boolean(),
  billedMonthlyRp: z.coerce.number().int().positive("Prime mensuelle requise."),
  tariffCode: z.string().trim().nullish().transform((v) => v || null),
  tariffLabel: z.string().trim().nullish().transform((v) => v || null),
  premiumTariffId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
});

export interface PolicySaveResult {
  id: number;
  match: { confidence: MatchConfidence; tariff: Tariff | null; candidates: Tariff[] } | null;
}

/**
 * Enregistre un contrat LAMal. S'il existe un jeu OFSP actif pour l'année, le contrat est rattaché
 * au tarif correspondant (code tarifaire, sinon prime la plus proche) ; un rattachement incertain
 * est renvoyé pour confirmation.
 */
export function savePolicy(ctx: AppContext, input: unknown): PolicySaveResult {
  const data = parse(policySchema, input);
  const p = ctx.household.person(data.personId);
  if (!p) throw new ValidationError("Personne introuvable.");
  ensureInsurer(ctx, data.insurerId);
  const h = requireHousehold(ctx);
  let match: PolicySaveResult["match"] = null;
  let premiumTariffId = data.premiumTariffId;
  let tariffCode = data.tariffCode;
  let tariffLabel = data.tariffLabel;
  let source: "OFSP_MATCH" | "MANUAL" = "MANUAL";

  if (premiumTariffId) {
    const t = ctx.tariffs.tariffById(premiumTariffId);
    if (!t) throw new ValidationError("Tarif OFSP introuvable.");
    tariffCode = t.tariffCode;
    tariffLabel = t.tariffLabel;
    source = "OFSP_MATCH";
  } else {
    const ds = ctx.tariffs.activeDataset(data.coverageYear);
    if (ds) {
      const ageClass = ageClassFor(p.birthDate, data.coverageYear);
      const tariffs = ctx.tariffs.tariffs({
        datasetId: ds.id,
        canton: h.canton,
        region: h.region,
        ageClass,
        accidentIncluded: data.accidentIncluded,
        insurerId: data.insurerId,
      });
      const result = matchPolicyToTariff(
        { ...data, tariffCode, tariffLabel, monthlyPremiumRp: data.billedMonthlyRp },
        tariffs,
        ageClass,
        ctx.tariffs.defaultSubgroup(ds.id, ageClass),
      );
      match = { confidence: result.confidence, tariff: result.tariff, candidates: result.candidates };
      if (result.tariff && result.confidence === "EXACT") {
        premiumTariffId = result.tariff.id;
        tariffCode = result.tariff.tariffCode;
        tariffLabel = result.tariff.tariffLabel;
        source = "OFSP_MATCH";
      }
    }
  }
  const id = ctx.household.savePolicy({
    personId: data.personId,
    coverageYear: data.coverageYear,
    insurerId: data.insurerId,
    policyNumber: data.policyNumber,
    premiumTariffId,
    tariffCode,
    tariffLabel,
    modelType: data.modelType as ModelType,
    franchiseChf: data.franchiseChf,
    accidentIncluded: data.accidentIncluded,
    billedMonthlyRp: data.billedMonthlyRp,
    source,
  });
  return { id, match };
}

/** Confirme le rattachement d'un contrat à un tarif OFSP proposé. */
export function linkPolicyToTariff(ctx: AppContext, policyId: number, tariffId: number): void {
  const policy = ctx.household.policy(policyId);
  const t = ctx.tariffs.tariffById(tariffId);
  if (!policy || !t) throw new ValidationError("Contrat ou tarif introuvable.");
  if (t.insurerId !== policy.insurerId) throw new ValidationError("Le tarif n'est pas chez la même caisse.");
  ctx.household.savePolicy({
    ...policy,
    premiumTariffId: t.id,
    tariffCode: t.tariffCode,
    tariffLabel: t.tariffLabel,
    modelType: t.modelType,
    source: "OFSP_MATCH",
  });
}

export const lcaSchema = z.object({
  personId: z.coerce.number().int().positive(),
  insurerId: z.coerce.number().int().positive("Choisis l'assureur."),
  productName: z.string().trim().min(1, "Nom du produit requis."),
  category: z.enum(LCA_CATEGORIES),
  policyNumber: z.string().trim().default(""),
  startDate: optionalIsoDate,
  minTermEnd: optionalIsoDate,
  noticeMonths: z.coerce.number().int().min(0).max(24),
  bundledDiscount: z.coerce.boolean(),
  status: z.enum(["ACTIVE", "TERMINATED"]).default("ACTIVE"),
  monthlyRp: z.coerce.number().int().min(0).nullish().transform((v) => v ?? null),
});

export function saveLcaPolicy(ctx: AppContext, id: number | null, input: unknown): number {
  const { monthlyRp, ...data } = parse(lcaSchema, input);
  ensureInsurer(ctx, data.insurerId);
  const savedId = ctx.household.saveLcaPolicy(id, data);
  if (monthlyRp !== null) ctx.household.saveLcaPremium(savedId, Number(ctx.clock.today().slice(0, 4)), monthlyRp);
  return savedId;
}

export function ensureInsurer(ctx: AppContext, insurerId: number): void {
  if (!ctx.reference.insurer(insurerId)) ctx.reference.upsertInsurer(insurerId, `Assureur n° ${insurerId}`, "UNKNOWN");
}
