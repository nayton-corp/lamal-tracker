import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { compareForLine } from "@/application/compare";
import { householdHistory } from "@/application/history";
import { listInsurers, saveHousehold, saveInsurer, saveLca, savePerson, savePolicy } from "@/application/household";
import { generateLetters, getLetter } from "@/application/letters";
import { generateOfferRequests, lcaWishesFor, listOfferRequests, markOfferRequestSent, setLcaWishes } from "@/application/offers";
import {
  acknowledgeLca,
  closeReview,
  deleteReview,
  getReviewByYear,
  confirmLineage,
  decide,
  getReviewView,
  markLetterSent,
  openReview,
  reopenReview,
  undoDecision,
  UserError,
} from "@/application/review";
import { openDb, type Db } from "@/infrastructure/db/client";
import { lamalPolicy, premium, tariffDataset } from "@/infrastructure/db/schema";
import { importPremiumFile } from "@/infrastructure/ofsp/importer";
import { FIXTURES_DIR } from "../fixtures/generate";

const NOW = "2026-10-05T08:00:00.000Z";
const TODAY = "2026-10-05";
let db: Db;

function insurerId(bag: number) {
  return listInsurers(db).find((i) => i.bagNumber === bag)!.id;
}

beforeAll(async () => {
  db = openDb(":memory:");
  const r26 = await importPremiumFile(db, path.join(FIXTURES_DIR, "primes-2026.xlsx"), "test");
  const r27 = await importPremiumFile(db, path.join(FIXTURES_DIR, "primes-2027.xlsx"), "test");
  expect(r26.status).toBe("IMPORTED");
  expect(r27.status).toBe("IMPORTED");
});

describe("import OFSP", () => {
  it("lit les deux formats, dédoublonne et ignore les frontaliers", async () => {
    const ds = db.select().from(tariffDataset).all();
    expect(ds.map((d) => [d.year, d.status])).toEqual([[2026, "ACTIVE"], [2027, "ACTIVE"]]);
    const rep26 = ds[0]!.report as { stats: { duplicates: number; skipped: Record<string, number>; insurers: number; cantons: number } };
    expect(rep26.stats.duplicates).toBeGreaterThan(0);
    expect(rep26.stats.skipped.hors_suisse).toBe(1);
    expect(rep26.stats.insurers).toBe(6);
    expect(rep26.stats.cantons).toBe(3);
    // 6 caisses × 3 tarifs × 6 régions × (2 sous-groupes enfant × 7 + 2 × 6) × 2 accident
    expect(db.select().from(premium).where(eq(premium.datasetId, ds[1]!.id)).all()).toHaveLength(6 * 3 * 6 * 26 * 2);
  });

  it("est idempotent par empreinte et accepte le CSV", async () => {
    const again = await importPremiumFile(db, path.join(FIXTURES_DIR, "primes-2027.xlsx"), "test");
    expect(again.status).toBe("ALREADY");
    const csv = await importPremiumFile(db, path.join(FIXTURES_DIR, "primes-2027.csv"), "csv", { cantons: ["VD"] });
    expect(csv.status).toBe("IMPORTED");
    const statuses = db.select().from(tariffDataset).all().filter((d) => d.year === 2027).map((d) => d.status);
    expect(statuses).toEqual(["SUPERSEDED", "ACTIVE"]);
  });
});

describe("rituel annuel", () => {
  let lines: { adult: number; teen: number };

  it("prépare le foyer", () => {
    saveHousehold(db, { name: "Famille Test", street: "Rue du Lac 1", postalCode: "1003", city: "Lausanne", canton: "VD", region: 1 });
    const adult = savePerson(db, 1, { firstName: "Alex", lastName: "Test", birthDate: "1988-04-12", healthCostsRp: 50000 });
    const teen = savePerson(db, 1, { firstName: "Noa", lastName: "Test", birthDate: "2008-09-01", kidSubgroup: "K1", healthCostsRp: 30000 });
    savePolicy(db, {
      personId: adult, coverageYear: 2026, insurerId: insurerId(1562), policyNumber: "HEL-123",
      tariffCode: "HEL-TEL26", tariffLabel: "Telmed HEL", modelType: "TELMED", franchiseChf: 2500, accident: false, billedMonthlyRp: 39000,
    });
    savePolicy(db, {
      personId: teen, coverageYear: 2026, insurerId: insurerId(8), policyNumber: null,
      tariffCode: "CSS-BASE", tariffLabel: "Base CSS", modelType: "STANDARD", franchiseChf: 0, accident: true, billedMonthlyRp: 12000,
    });
    saveLca(db, { personId: adult, insurerName: "Helsana Assurances complémentaires SA", linkedInsurerId: insurerId(1562), productName: "Hospitalisation mi-privée", guarantee: "HOSPITAL_SEMI_PRIVATE" });
  });

  it("ouvre la revue et retrouve les renouvellements", () => {
    const { reviewId, skipped } = openReview(db, 2027);
    expect(skipped).toEqual([]);
    const view = getReviewView(db, reviewId, TODAY);
    const [adult, teen] = view.persons;
    lines = { adult: adult!.line.id, teen: teen!.line.id };
    // Code Telmed renommé entre 2026 et 2027 : un seul tarif Telmed chez HEL → probable.
    expect(adult!.line.renewalStatus).toBe("PROBABLE");
    expect(adult!.line.renewalTariffCode).toBe("HEL-TEL");
    expect(adult!.increaseRp).not.toBeNull();
    // 2008 → 19 ans en 2027 : jeune adulte, franchise enfant 0 → 300.
    expect(teen!.line.targetAgeClass).toBe("YOUNG");
    expect(teen!.line.renewalFranchiseChf).toBe(300);
    expect(teen!.transition).toMatch(/jeune adulte/);
    expect(view.deadlines.receiptDeadline).toBe("2026-11-30");
    expect(adult!.best?.insurerName).toBe("Assura");
    expect(view.totals.potentialAnnualSavingsRp).toBeGreaterThan(0);
    expect(adult!.lcaWarnings[0]!.level).toBe("danger");
  });

  it("confirme une lignée", () => {
    confirmLineage(db, lines.adult, "HEL-TEL");
    const view = getReviewView(db, 1, TODAY);
    expect(view.persons[0]!.line.renewalStatus).toBe("MATCHED");
  });

  it("compare et décide", () => {
    const cmp = compareForLine(db, lines.adult, { sort: "total" });
    expect(cmp.offers.length).toBeGreaterThan(3);
    expect(new Set(cmp.offers.map((o) => o.insurerId)).size).toBe(cmp.offers.length);
    expect(cmp.matchingOffers).toBeGreaterThan(cmp.offers.length);
    expect(cmp.offers[0]!.rank).toBe(1);
    expect(cmp.renewal?.franchiseChf).toBe(2500);
    expect(cmp.curve.points.length).toBeGreaterThan(10);
    const best = cmp.offers[0]!;
    expect(decide(db, lines.adult, { tariffId: best.tariffId, franchiseChf: best.franchiseChf }, NOW)).toBe("SWITCH");

    const teenCmp = compareForLine(db, lines.teen, { all: true, everyOffer: true });
    const sameInsurerOther = teenCmp.offers.find((o) => o.insurerId === insurerId(8) && o.tariffCode === "CSS-TEL")!;
    expect(decide(db, lines.teen, { tariffId: sameInsurerOther.tariffId, franchiseChf: sameInsurerOther.franchiseChf }, NOW)).toBe("ADJUST");
  });

  it("prépare la demande d'offre à la nouvelle caisse, complémentaires comprises", () => {
    const ids = generateOfferRequests(db, 1, TODAY);
    expect(ids).toHaveLength(1);
    const [req] = listOfferRequests(db, 1);
    expect(req!.content.subject).toMatch(/Demande d'offre et d'affiliation .* 1er janvier 2027/);
    expect(req!.content.personRows[0]).toMatch(/^Alex Test, né·e le .*franchise CHF \d+, (avec|sans) couverture accident/);
    expect(req!.content.extraRows).toEqual(["Alex Test : hospitalisation demi-privée"]);
    expect(req!.content.mailing).toBeNull();

    // Complémentaires modifiées : la demande non envoyée est refaite.
    setLcaWishes(db, lines.adult, ["HOSPITAL_SEMI_PRIVATE", "DENTAL", "bidon"]);
    expect(lcaWishesFor(db, { personId: 0, lcaWishes: ["DENTAL", "bidon"] })).toEqual(["DENTAL"]);
    generateOfferRequests(db, 1, TODAY);
    const [again] = listOfferRequests(db, 1);
    expect(listOfferRequests(db, 1)).toHaveLength(1);
    expect(again!.content.extraRows).toEqual(["Alex Test : hospitalisation demi-privée, soins dentaires"]);

    // Envoyée : vaut demande d'affiliation, et n'est plus régénérée.
    markOfferRequestSent(db, again!.id, TODAY);
    expect(getReviewView(db, 1, TODAY).persons[0]!.line.affiliationRequestedAt).toBe(TODAY);
    expect(generateOfferRequests(db, 1, TODAY)).toEqual([]);
  });

  it("refuse la résiliation sans contrôle LCA ; l'adresse officielle suffit", () => {
    const res = generateLetters(db, 1, TODAY);
    // Noa change seulement de modèle chez CSS : l'adresse de l'annuaire officiel suffit.
    expect(res.created).toHaveLength(1);
    expect(getLetter(db, res.created[0]!)!.content.insurerLines).toEqual(["CSS Assurance-maladie SA", "Tribschenstrasse 21", "Postfach 2568", "6002 Luzern"]);
    expect(res.blocked.map((b) => b.person)).toEqual(["Alex Test"]);
    expect(res.blocked[0]!.reasons.join(" ")).toMatch(/LCA/);
  });

  it("génère les lettres une fois les garde-fous levés", () => {
    acknowledgeLca(db, lines.adult, NOW);
    saveInsurer(db, { id: insurerId(1562), terminationAddress: "Case postale\n8081 Zurich" }, NOW);
    saveInsurer(db, { id: insurerId(8), terminationAddress: "Case postale 2568\n6002 Lucerne" }, NOW);
    const res = generateLetters(db, 1, TODAY);
    expect(res.blocked).toEqual([]);
    expect(res.created).toHaveLength(2);
    const termination = getLetter(db, res.created[0]!)!;
    expect(termination.kind).toBe("TERMINATION");
    expect(termination.content.lcaClause).toMatch(/LCA/);
    expect(termination.content.insurerLines).toEqual(["Helsana Assurances SA", "Case postale", "8081 Zurich"]);
    expect(termination.content.personRows[0]).toMatch(/HEL-123/);
    // Régénérer remplace les lettres non envoyées.
    const again = generateLetters(db, 1, TODAY);
    expect(again.created).toHaveLength(2);
    expect(getReviewView(db, 1, TODAY).letters).toHaveLength(2);
    markLetterSent(db, again.created[0]!, TODAY, "98.00.123456.12345678");
    expect(() => undoDecision(db, lines.adult)).toThrow(UserError);
  });

  it("clôt la revue et crée les contrats de l'année suivante", () => {
    closeReview(db, 1, NOW);
    const policies2027 = db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all();
    expect(policies2027).toHaveLength(2);
    expect(policies2027.find((p) => p.insurerId === insurerId(8))?.policyNumber).toBeNull();
    const history = householdHistory(db);
    expect(history.years).toEqual([2026, 2027]);
    expect(history.persons[0]!.points[1]!.changePermille).not.toBeNull();
    expect(history.persons[0]!.points[0]!.marketMedianRp).not.toBeNull();
    // Redistribution CO2 2027 : 57.00 / 12 = 4.75
    const p = history.persons[0]!.points[1]!;
    expect(p.billedMonthlyRp - p.netMonthlyRp).toBe(475);
    // Statistiques : total payé, économie du rituel 2027, position dans le marché.
    const s = history.stats;
    expect(s.totalPaidRp).toBe(history.persons.reduce((a, x) => a + x.points.reduce((b, pt) => b + pt.billedMonthlyRp * 12, 0), 0));
    expect(s.ritualSavings).toHaveLength(1);
    expect(s.ritualSavings[0]!.year).toBe(2027);
    expect(s.ritualSavings[0]!.annualRp).toBeGreaterThan(0);
    expect(s.avgChangePermille).not.toBeNull();
    expect(history.totals[1]!.marketMinMonthlyRp).toBeLessThanOrEqual(history.totals[1]!.marketMedianMonthlyRp!);
    expect(s.gapToCheapestAnnualRp).toBeGreaterThanOrEqual(0);
  });

  it("rouvre un rituel clôturé : les contrats créés disparaissent, les décisions restent", () => {
    reopenReview(db, 1);
    expect(getReviewByYear(db, 2027)?.status).toBe("OPEN");
    expect(db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all()).toHaveLength(0);
    expect(getReviewView(db, 1, TODAY).persons.every((p) => p.line.decision !== "UNDECIDED")).toBe(true);
    closeReview(db, 1, NOW);
    expect(db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all()).toHaveLength(2);
  });

  it("supprime un rituel clôturé et revient à l'état d'avant", () => {
    deleteReview(db, 1);
    expect(getReviewByYear(db, 2027)).toBeNull();
    expect(db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all()).toHaveLength(0);
    expect(db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2026)).all()).toHaveLength(2);
    const { reviewId } = openReview(db, 2027);
    expect(getReviewView(db, reviewId, TODAY).persons.every((p) => p.line.decision === "UNDECIDED")).toBe(true);
  });
});
