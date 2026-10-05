import { and, eq, inArray } from "drizzle-orm";
import { ageClassForYear } from "@/domain/age";
import { guaranteeInfo, type LcaGuarantee } from "@/domain/lca";
import { DEFAULT_HEALTH_COSTS_RP, defaultSubgroup, type ModelType, FIRST_PREMIUM_YEAR } from "@/domain/lamal";
import { franchisesFor } from "@/domain/parameters";
import { extractPolicy, findInsurer, readHolder, readYear, type HolderAddress, type HolderPerson, type PolicyExtract } from "@/domain/policy-import";
import { lookupPostalCode, type CommuneOption } from "@/infrastructure/regions/postal";
import type { Db } from "@/infrastructure/db/client";
import { activeDataset, insurerLabel, parametersFor } from "@/infrastructure/db/queries";
import { insurer, premium, tariff } from "@/infrastructure/db/schema";
import { withHousehold, type Scope } from "./scope";
import { getHousehold, listInsurers, listLca, listPersons, saveHousehold, saveLca, savePerson, savePolicy, setHouseholdMode } from "./household";
import { UserError } from "./errors";

export interface ImportedPerson {
  personId: number;
  name: string;
  /** Tarif retrouvé dans les primes officielles grâce au montant exact de la police. */
  matched: boolean;
  tariffCode: string | null;
  tariffLabel: string | null;
  modelType: ModelType;
  franchiseChf: number | null;
  accident: boolean;
  billedMonthlyRp: number | null;
  policyNumber: string | null;
  lca: { guarantee: LcaGuarantee; label: string; monthlyRp: number | null }[];
}

export interface PolicyImport {
  insurerId: number | null;
  insurerName: string | null;
  year: number;
  persons: ImportedPerson[];
  warnings: string[];
}

interface Candidate {
  insurerId: number;
  code: string;
  label: string;
  modelType: ModelType;
  franchise: number;
  accident: boolean;
  monthly: number;
}

/** Primes officielles d'une personne pour l'année, dont le montant figure sur la police. */
function candidates(db: Db, scope: Scope, year: number, birthDate: string, kidSubgroup: string, amounts: number[], insurerId: number | null): Candidate[] {
  const h = getHousehold(db, scope);
  const ds = activeDataset(db, year);
  if (!h || !ds || amounts.length === 0) return [];
  const ageClass = ageClassForYear(birthDate, year);
  return db
    .select({ insurerId: tariff.insurerId, code: tariff.code, label: tariff.label, modelType: tariff.modelType, franchise: premium.franchiseChf, accident: premium.accident, monthly: premium.monthlyRp })
    .from(premium)
    .innerJoin(tariff, eq(premium.tariffId, tariff.id))
    .where(
      and(
        eq(premium.datasetId, ds.id),
        eq(premium.canton, h.canton),
        eq(premium.region, h.region),
        eq(premium.ageClass, ageClass),
        eq(premium.subgroup, ageClass === "KID" ? kidSubgroup : defaultSubgroup(ageClass)),
        inArray(premium.monthlyRp, amounts),
        ...(insurerId ? [eq(tariff.insurerId, insurerId)] : []),
      ),
    )
    .all()
    .map((c) => ({ ...c, modelType: c.modelType as ModelType }));
}

/** Préfère le candidat cohérent avec ce qu'on a lu (franchise, accident, modèle). */
function bestCandidate(list: Candidate[], read: PolicyExtract["persons"][number]): Candidate | null {
  const score = (c: Candidate) =>
    (read.franchiseChf === c.franchise ? 4 : read.franchiseChf === null ? 0 : -4) +
    (read.accident === c.accident ? 2 : read.accident === null ? 0 : -2) +
    (read.modelType === c.modelType ? 1 : 0);
  return [...list].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * Analyse le texte d'une police : caisse, année, puis pour chaque membre du foyer reconnu, le
 * tarif officiel dont la prime figure sur la police (ou, à défaut, ce qu'on a pu lire).
 */
export function analyzePolicyText(db: Db, scope: Scope, text: string, currentYear: number): PolicyImport {
  const h = getHousehold(db, scope);
  if (!h) throw new UserError("Configurez d'abord le foyer (canton, région, membres).");
  const persons = listPersons(db, h.id);
  if (persons.length === 0) throw new UserError("Ajoutez d'abord les membres du foyer : leur date de naissance permet de les retrouver dans la police.");
  const insurers = listInsurers(db);
  const guessYear = readYear(text, FIRST_PREMIUM_YEAR, currentYear + 1) ?? currentYear;
  const franchises = [...new Set([...franchisesFor(parametersFor(db, guessYear), "ADULT"), ...franchisesFor(parametersFor(db, guessYear), "KID")])];
  const extract = extractPolicy(text, {
    persons: persons.filter((p) => Number(p.birthDate.slice(0, 4)) <= guessYear),
    insurers: importInsurers(insurers),
    franchises,
    minYear: FIRST_PREMIUM_YEAR,
    maxYear: currentYear + 1,
  });
  const warnings: string[] = [];
  if (extract.noText) throw new UserError(NO_TEXT);
  const year = extract.year ?? currentYear;
  if (!extract.year) warnings.push(`Année de la police non trouvée : ${year} par défaut.`);
  if (extract.persons.length === 0) warnings.push("Aucune personne reconnue : vérifiez les dates de naissance.");

  let insurerId = extract.insurerId;
  const out: ImportedPerson[] = extract.persons.map((read) => {
    const p = persons.find((x) => x.id === read.personId)!;
    let list = candidates(db, scope, year, p.birthDate, p.kidSubgroup, read.amountsRp, insurerId);
    // Caisse mal reconnue (ou absente) : la prime exacte suffit à retrouver le tarif.
    if (list.length === 0) list = candidates(db, scope, year, p.birthDate, p.kidSubgroup, read.amountsRp, null);
    const c = bestCandidate(list, read);
    if (c && (insurerId === null || list.every((x) => x.insurerId === c.insurerId))) insurerId = c.insurerId;
    return {
      personId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      matched: Boolean(c),
      tariffCode: c?.code ?? null,
      tariffLabel: c?.label ?? null,
      modelType: c?.modelType ?? read.modelType ?? "STANDARD",
      franchiseChf: c?.franchise ?? read.franchiseChf,
      accident: c?.accident ?? read.accident ?? !p.employedAccidentCover,
      // Tarif non retrouvé : on propose quand même la prime lue (un montant plausible, hors franchise), à vérifier.
      billedMonthlyRp: c?.monthly ?? read.amountsRp.find((a) => a >= 3000 && a <= 200000 && !franchises.includes(a / 100)) ?? null,
      policyNumber: read.policyNumber,
      lca: read.lca.map((l) => ({ ...l, label: guaranteeInfo(l.guarantee)!.label })),
    };
  });
  for (const p of out) if (!p.matched) warnings.push(`${p.name} : prime non retrouvée dans les primes officielles ${year}, à compléter.`);
  const ins = insurerId ? db.select().from(insurer).where(eq(insurer.id, insurerId)).get() : null;
  if (!ins) warnings.push("Caisse non reconnue : choisissez-la.");
  return { insurerId: ins?.id ?? null, insurerName: ins ? insurerLabel(ins) : null, year, persons: out, warnings };
}

const NO_TEXT = "Ce PDF ne contient pas de texte lisible (document scanné) : passez par la saisie guidée.";

function importInsurers(insurers: ReturnType<typeof listInsurers>) {
  return insurers.map((i) => ({ id: i.id, names: [i.name, i.displayName, i.legalNameFr].filter((n): n is string => Boolean(n)), group: i.groupName }));
}

export interface PolicyHolderPreview {
  insurerName: string | null;
  year: number;
  persons: HolderPerson[];
  address: HolderAddress | null;
  /** Communes possibles pour le code postal lu (la région de primes en dépend). */
  communes: CommuneOption[];
}

/**
 * Accueil depuis la police, avant tout foyer : qui est assuré et où, lus dans le PDF. Rien n'est
 * enregistré ; l'utilisateur vérifie, puis `createHouseholdFromPolicy` crée le foyer.
 */
export function previewPolicyHolder(db: Db, text: string, currentYear: number): PolicyHolderPreview {
  if (text.replace(/\s/g, "").length < 40) throw new UserError(NO_TEXT);
  const insurers = listInsurers(db);
  const holder = readHolder(text, { maxYear: currentYear, insurerNames: insurers.flatMap((i) => [i.name, i.displayName, i.legalNameFr, i.groupName]).filter((n): n is string => Boolean(n)) });
  const insurerId = findInsurer(text.slice(0, 1500), importInsurers(insurers)) ?? findInsurer(text, importInsurers(insurers));
  const ins = insurers.find((i) => i.id === insurerId) ?? null;
  return {
    insurerName: ins ? insurerLabel(ins) : null,
    year: readYear(text, FIRST_PREMIUM_YEAR, currentYear + 1) ?? currentYear,
    persons: holder.persons,
    address: holder.address,
    communes: holder.address ? lookupPostalCode(holder.address.postalCode) : [],
  };
}

export interface HouseholdFromPolicy {
  address: { street: string; postalCode: string; city: string; bfsNumber: number | null; canton: string; region: number; commune: string };
  persons: { firstName: string; lastName: string; birthDate: string }[];
}

/** Crée le foyer et ses personnes d'un coup (accueil depuis la police) ; solo si une seule personne. */
export function createHouseholdFromPolicy(db: Db, scope: Scope, input: HouseholdFromPolicy): number {
  if (scope.householdId !== null) throw new UserError("Un foyer existe déjà.");
  if (input.persons.length === 0) throw new UserError("Indiquez au moins une personne.");
  const first = input.persons[0]!;
  return db.transaction(() => {
    const id = saveHousehold(db, scope, {
      name: input.persons.length === 1 ? `${first.firstName} ${first.lastName}` : `Famille ${first.lastName}`,
      ...input.address,
      canton: input.address.canton as never,
    });
    const created = withHousehold(scope, id);
    for (const p of input.persons) savePerson(db, created, { ...p, healthCostsRp: DEFAULT_HEALTH_COSTS_RP });
    setHouseholdMode(db, created, input.persons.length === 1 ? "SOLO" : "FAMILY");
    return id;
  });
}

export interface ConfirmedImport {
  insurerId: number;
  year: number;
  persons: {
    personId: number;
    tariffCode: string | null;
    tariffLabel: string | null;
    modelType: ModelType;
    franchiseChf: number;
    accident: boolean;
    billedMonthlyRp: number;
    policyNumber: string | null;
    lca: { guarantee: LcaGuarantee; monthlyRp: number | null }[];
  }[];
}

/** Enregistre les contrats confirmés (remplace le contrat de l'année s'il existe) et les complémentaires nouvelles. */
export function applyPolicyImport(db: Db, scope: Scope, input: ConfirmedImport): number {
  const ins = db.select().from(insurer).where(eq(insurer.id, input.insurerId)).get();
  if (!ins) throw new UserError("Caisse inconnue.");
  db.transaction(() => {
    for (const p of input.persons) {
      savePolicy(db, scope, {
        personId: p.personId,
        coverageYear: input.year,
        insurerId: input.insurerId,
        policyNumber: p.policyNumber,
        tariffCode: p.tariffCode,
        tariffLabel: p.tariffLabel,
        modelType: p.modelType,
        franchiseChf: p.franchiseChf,
        accident: p.accident,
        billedMonthlyRp: p.billedMonthlyRp,
      });
      const existing = new Set(listLca(db, p.personId).filter((c) => c.active).map((c) => c.guarantee));
      for (const l of p.lca.filter((x) => !existing.has(x.guarantee))) {
        saveLca(db, scope, {
          personId: p.personId,
          insurerName: ins.groupName ?? insurerLabel(ins),
          linkedInsurerId: input.insurerId,
          guarantee: l.guarantee,
          monthlyRp: l.monthlyRp,
        });
      }
    }
  });
  return input.persons.length;
}
