import { and, eq, inArray } from "drizzle-orm";
import { ageClassForYear } from "@/domain/age";
import { guaranteeInfo, type LcaGuarantee } from "@/domain/lca";
import { defaultSubgroup, type ModelType } from "@/domain/lamal";
import { franchisesFor } from "@/domain/parameters";
import { extractPolicy, type PolicyExtract } from "@/domain/policy-import";
import type { Db } from "@/infrastructure/db/client";
import { activeDataset, insurerLabel, parametersFor } from "@/infrastructure/db/queries";
import { insurer, premium, tariff } from "@/infrastructure/db/schema";
import { getHousehold, listInsurers, listLca, listPersons, saveLca, savePolicy } from "./household";
import { UserError } from "./review";

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
function candidates(db: Db, year: number, birthDate: string, kidSubgroup: string, amounts: number[], insurerId: number | null): Candidate[] {
  const h = getHousehold(db);
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
export function analyzePolicyText(db: Db, text: string, currentYear: number): PolicyImport {
  const h = getHousehold(db);
  if (!h) throw new UserError("Configurez d'abord le foyer (canton, région, membres).");
  const persons = listPersons(db, h.id);
  if (persons.length === 0) throw new UserError("Ajoutez d'abord les membres du foyer : leur date de naissance permet de les retrouver dans la police.");
  const insurers = listInsurers(db);
  const extract = extractPolicy(text, {
    persons,
    insurers: insurers.map((i) => ({ id: i.id, names: [i.name, i.displayName, i.legalNameFr, i.groupName].filter((n): n is string => Boolean(n)) })),
    franchises: [...new Set([...franchisesFor(parametersFor(db, currentYear), "ADULT"), ...franchisesFor(parametersFor(db, currentYear), "KID")])],
    minYear: 2010,
    maxYear: currentYear + 1,
  });
  const warnings: string[] = [];
  if (extract.noText) throw new UserError("Ce PDF ne contient pas de texte lisible (document scanné ou photo). Importez le PDF reçu de la caisse (portail client ou e-mail).");
  const year = extract.year ?? currentYear;
  if (!extract.year) warnings.push(`Année de la police non trouvée : ${year} par défaut.`);
  if (extract.persons.length === 0) warnings.push("Aucun membre du foyer reconnu : vérifiez les dates de naissance dans Foyer.");

  let insurerId = extract.insurerId;
  const out: ImportedPerson[] = extract.persons.map((read) => {
    const p = persons.find((x) => x.id === read.personId)!;
    let list = candidates(db, year, p.birthDate, p.kidSubgroup, read.amountsRp, insurerId);
    if (list.length === 0 && insurerId === null) list = candidates(db, year, p.birthDate, p.kidSubgroup, read.amountsRp, null);
    const c = bestCandidate(list, read);
    if (c && insurerId === null) insurerId = c.insurerId;
    return {
      personId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      matched: Boolean(c),
      tariffCode: c?.code ?? null,
      tariffLabel: c?.label ?? null,
      modelType: c?.modelType ?? read.modelType ?? "STANDARD",
      franchiseChf: c?.franchise ?? read.franchiseChf,
      accident: c?.accident ?? read.accident ?? !p.employedAccidentCover,
      billedMonthlyRp: c?.monthly ?? null,
      policyNumber: read.policyNumber,
      lca: read.lca.map((l) => ({ ...l, label: guaranteeInfo(l.guarantee)!.label })),
    };
  });
  for (const p of out) if (!p.matched) warnings.push(`${p.name} : prime non retrouvée dans les primes officielles ${year}, à compléter.`);
  const ins = insurerId ? db.select().from(insurer).where(eq(insurer.id, insurerId)).get() : null;
  if (!ins) warnings.push("Caisse non reconnue : choisissez-la.");
  return { insurerId: ins?.id ?? null, insurerName: ins ? insurerLabel(ins) : null, year, persons: out, warnings };
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
export function applyPolicyImport(db: Db, input: ConfirmedImport): number {
  const ins = db.select().from(insurer).where(eq(insurer.id, input.insurerId)).get();
  if (!ins) throw new UserError("Caisse inconnue.");
  db.transaction(() => {
    for (const p of input.persons) {
      savePolicy(db, {
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
        saveLca(db, {
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
