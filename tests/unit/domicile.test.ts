import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { saveHouseholdAddress } from "@/application/domicile";
import { listInsurers, listPolicies, saveHousehold, savePerson, savePolicy } from "@/application/household";
import { closeReview, decide, getReviewView, keepAsIs, openReview, setLineDomiciles } from "@/application/review";
import { compareForLine } from "@/application/compare";
import { openDb, type Db } from "@/infrastructure/db/client";
import { lamalPolicy } from "@/infrastructure/db/schema";
import { importPremiumFile } from "@/infrastructure/ofsp/importer";
import { FIXTURES_DIR } from "../fixtures/generate";
import { testAccount } from "../accounts";
import { withHousehold, type Scope } from "@/application/scope";

const NOW = "2026-10-05T08:00:00.000Z";
const TODAY = "2026-10-05";
const LAUSANNE = { commune: "Lausanne", bfsNumber: 5586, canton: "VD", region: 1 };
const ZURICH = { commune: "Zürich", bfsNumber: 261, canton: "ZH", region: 2 };
const GENEVE = { commune: "Genève", bfsNumber: 6621, canton: "GE", region: 0 };

let db: Db;
let scope: Scope;
let alex: number;
let noa: number;

const insurerId = (bag: number) => listInsurers(db).find((i) => i.bagNumber === bag)!.id;
const lineOf = (personId: number) => getReviewView(db, scope, 1, TODAY).lines.find((l) => l.person.id === personId)!.line;

beforeAll(async () => {
  db = openDb(":memory:");
  scope = testAccount(db, "ADMIN");
  await importPremiumFile(db, path.join(FIXTURES_DIR, "primes-2026.xlsx"), "test");
  await importPremiumFile(db, path.join(FIXTURES_DIR, "primes-2027.xlsx"), "test");
  scope = withHousehold(scope, saveHousehold(db, scope, { name: "Famille Test", street: "Rue du Lac 1", postalCode: "1003", city: "Lausanne", ...LAUSANNE, canton: "VD" }));
  alex = savePerson(db, scope, { firstName: "Alex", lastName: "Test", birthDate: "1988-04-12" });
  noa = savePerson(db, scope, { firstName: "Noa", lastName: "Test", birthDate: "1990-02-01" });
  for (const personId of [alex, noa]) {
    savePolicy(db, scope, { personId, coverageYear: 2026, insurerId: insurerId(8), tariffCode: "CSS-BASE", tariffLabel: "Base CSS", modelType: "STANDARD", franchiseChf: 300, accident: true, billedMonthlyRp: 50000 });
  }
});

describe("domicile par contrat", () => {
  it("un contrat saisi sans domicile prend l'adresse du foyer ; un autre peut garder le sien", () => {
    expect(listPolicies(db, alex)[0]!.policy).toMatchObject(LAUSANNE);
    savePolicy(db, scope, { personId: alex, coverageYear: 2025, insurerId: insurerId(8), modelType: "STANDARD", franchiseChf: 300, accident: true, billedMonthlyRp: 45000, ...ZURICH, canton: "ZH" });
    expect(listPolicies(db, alex).find((p) => p.policy.coverageYear === 2025)!.policy).toMatchObject(ZURICH);
  });

  it("le bilan part de l'adresse du foyer, puis suit le domicile indiqué pour le 1er janvier", () => {
    openReview(db, scope, 2027);
    const before = lineOf(alex);
    expect(before).toMatchObject(LAUSANNE);
    const vaudRenewal = before.renewalMonthlyRp!;

    const best = compareForLine(db, scope, before.id).offers[0]!;
    decide(db, scope, before.id, { tariffId: best.tariffId, franchiseChf: best.franchiseChf }, NOW);
    const change = setLineDomiciles(db, scope, 1, [alex], { ...ZURICH });
    expect(change).toEqual({ updated: ["Alex Test"], locked: [] });

    const after = lineOf(alex);
    expect(after).toMatchObject(ZURICH);
    // Primes zurichoises (fixture : base 420 en ZH-2 contre 520 en VD-1), choix remis à zéro.
    expect(after.renewalMonthlyRp).toBeLessThan(vaudRenewal);
    expect(after.decision).toBe("UNDECIDED");
    expect(compareForLine(db, scope, after.id).offers[0]!.monthlyPremiumRp).toBeLessThan(best.monthlyPremiumRp);
    expect(lineOf(noa)).toMatchObject(LAUSANNE);
  });

  it("un déménagement du foyer déplace le bilan, pas les contrats passés", () => {
    saveHouseholdAddress(db, scope, { name: "Famille Test", street: "Rue du Rhône 1", postalCode: "1204", city: "Genève", ...GENEVE, canton: "GE" }, "MOVE");
    expect(listPolicies(db, noa)[0]!.policy).toMatchObject(LAUSANNE);
    // Noa suivait l'adresse du foyer ; Alex avait un domicile à part (Zurich), qui reste.
    expect(lineOf(noa)).toMatchObject(GENEVE);
    expect(lineOf(alex)).toMatchObject(ZURICH);
  });

  it("une correction d'adresse reporte la nouvelle commune sur les contrats qui avaient l'ancienne", () => {
    saveHouseholdAddress(db, scope, { name: "Famille Test", street: "Rue du Lac 1", postalCode: "1003", city: "Lausanne", ...LAUSANNE, canton: "VD" }, "CORRECTION");
    expect(listPolicies(db, noa)[0]!.policy).toMatchObject(LAUSANNE);
    saveHouseholdAddress(db, scope, { name: "Famille Test", street: "Rue de Lausanne 2", postalCode: "1020", city: "Renens", commune: "Renens (VD)", bfsNumber: 5591, canton: "VD", region: 2 }, "CORRECTION");
    const policies = listPolicies(db, alex).map((p) => p.policy);
    expect(policies.find((p) => p.coverageYear === 2026)).toMatchObject({ canton: "VD", region: 2, bfsNumber: 5591 });
    expect(policies.find((p) => p.coverageYear === 2025)).toMatchObject(ZURICH);
  });

  it("la clôture crée les contrats de l'année cible avec le domicile du bilan", () => {
    for (const personId of [alex, noa]) keepAsIs(db, scope, lineOf(personId).id, NOW);
    closeReview(db, scope, 1, NOW);
    const created = db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all();
    expect(created.find((p) => p.personId === alex)).toMatchObject(ZURICH);
    expect(created.find((p) => p.personId === noa)).toMatchObject({ canton: "VD", region: 2 });
  });
});

describe("migration 0011", () => {
  const previous = process.env.MIGRATIONS_DIR;
  afterEach(() => {
    process.env.MIGRATIONS_DIR = previous;
  });

  it("donne aux contrats et lignes de bilan existants l'adresse du foyer", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-domicile-"));
    const migrations = path.join(dir, "drizzle");
    fs.cpSync(path.join(process.cwd(), "drizzle"), migrations, { recursive: true });
    const journalPath = path.join(migrations, "meta", "_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
    fs.writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.tag < "0011") }));
    process.env.MIGRATIONS_DIR = migrations;
    const file = path.join(dir, "lamal.db");
    openDb(file).$client.close();

    const raw = new Database(file);
    const insurer = (raw.prepare("SELECT id FROM insurer LIMIT 1").get() as { id: number }).id;
    raw.prepare("INSERT INTO household (id, name, commune, bfs_number, canton, region) VALUES (1, 'F', 'Sion', 6266, 'VS', 1)").run();
    raw.prepare("INSERT INTO person (id, household_id, first_name, last_name, birth_date) VALUES (1, 1, 'A', 'B', '1980-01-01')").run();
    raw.prepare("INSERT INTO lamal_policy (person_id, coverage_year, insurer_id, model_type, franchise_chf, accident, billed_monthly_rp, source) VALUES (1, 2026, ?, 'STANDARD', 300, 1, 40000, 'MANUAL')").run(insurer);
    raw.close();

    fs.cpSync(path.join(process.cwd(), "drizzle", "meta", "_journal.json"), journalPath);
    const migrated = openDb(file);
    expect(migrated.select().from(lamalPolicy).get()).toMatchObject({ commune: "Sion", bfsNumber: 6266, canton: "VS", region: 1 });
    migrated.$client.close();
  });
});
