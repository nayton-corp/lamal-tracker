import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { compareForLine } from "@/application/compare";
import { listSignatures, saveSignature, signaturesByName } from "@/application/signatures";
import { saveNeeds, setStrategy, strategyOverview } from "@/application/strategy";
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
  keepAsIs,
  markLetterSent,
  openReview,
  reopenReview,
  undoDecision,
} from "@/application/review";
import { UserError } from "@/application/errors";
import { openDb, type Db } from "@/infrastructure/db/client";
import { lamalPolicy, premium, tariffDataset } from "@/infrastructure/db/schema";
import { importPremiumFile } from "@/infrastructure/ofsp/importer";
import { FIXTURES_DIR } from "../fixtures/generate";
import { testAccount } from "../accounts";
import { withHousehold, type Scope } from "@/application/scope";

const NOW = "2026-10-05T08:00:00.000Z";
const TODAY = "2026-10-05";
let db: Db;
let scope: Scope;

function insurerId(bag: number) {
  return listInsurers(db).find((i) => i.bagNumber === bag)!.id;
}

beforeAll(async () => {
  db = openDb(":memory:");
  scope = testAccount(db, "ADMIN");
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
    scope = withHousehold(scope, saveHousehold(db, scope, { name: "Famille Test", street: "Rue du Lac 1", postalCode: "1003", city: "Lausanne", canton: "VD", region: 1 }));
    const adult = savePerson(db, scope, { firstName: "Alex", lastName: "Test", birthDate: "1988-04-12", healthCostsRp: 50000 });
    const teen = savePerson(db, scope, { firstName: "Noa", lastName: "Test", birthDate: "2008-09-01", kidSubgroup: "K1", healthCostsRp: 30000 });
    savePolicy(db, scope, {
      personId: adult, coverageYear: 2026, insurerId: insurerId(1562), policyNumber: "HEL-123",
      tariffCode: "HEL-TEL26", tariffLabel: "Telmed HEL", modelType: "TELMED", franchiseChf: 2500, accident: false, billedMonthlyRp: 39000,
    });
    savePolicy(db, scope, {
      personId: teen, coverageYear: 2026, insurerId: insurerId(8), policyNumber: null,
      tariffCode: "CSS-BASE", tariffLabel: "Base CSS", modelType: "STANDARD", franchiseChf: 0, accident: true, billedMonthlyRp: 12000,
    });
    saveLca(db, scope, { personId: adult, insurerName: "Helsana Assurances complémentaires SA", linkedInsurerId: insurerId(1562), productName: "Hospitalisation mi-privée", guarantee: "HOSPITAL_SEMI_PRIVATE" });
  });

  it("ouvre la revue et retrouve les renouvellements", () => {
    const { reviewId, skipped } = openReview(db, scope, 2027);
    expect(skipped).toEqual([]);
    const view = getReviewView(db, scope, reviewId, TODAY);
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
    confirmLineage(db, scope, lines.adult, "HEL-TEL");
    const view = getReviewView(db, scope, 1, TODAY);
    expect(view.persons[0]!.line.renewalStatus).toBe("MATCHED");
  });

  it("compare les trois stratégies, puis applique la stratégie et les besoins", () => {
    const overview = strategyOverview(db, scope, 1);
    expect(overview.map((o) => o.strategy)).toEqual(["ECONOMY", "KEEP", "BALANCE"]);
    const economy = overview.find((o) => o.strategy === "ECONOMY")!;
    const keep = overview.find((o) => o.strategy === "KEEP")!;
    // Économie max explore tout : jamais moins d'économie que le maintien.
    expect(economy.annualSavingsRp!).toBeGreaterThanOrEqual(keep.annualSavingsRp!);
    const keepAdult = keep.persons.find((p) => p.lineId === lines.adult)!.offer!;
    expect(keepAdult.modelType).toBe("TELMED");
    expect(keepAdult.franchiseChf).toBe(2500);

    let view = getReviewView(db, scope, 1, TODAY);
    expect(view.steps.map((s) => [s.key, s.done])).toEqual([
      ["renewal", true], ["strategy", false], ["needs", false], ["decide", false], ["procedures", false], ["confirmed", false],
    ]);

    setStrategy(db, scope, 1, "KEEP");
    const kept = compareForLine(db, scope, lines.adult);
    expect(kept.sort).toBe("strategy");
    expect(kept.effective).toEqual({ models: ["TELMED"], franchiseChf: 2500 });
    expect(kept.offers.every((o) => o.modelType === "TELMED" && o.franchiseChf === 2500)).toBe(true);
    expect(kept.picks).toHaveLength(3);
    // Un filtre explicite (URL) l'emporte sur les besoins ; [] = tous.
    expect(compareForLine(db, scope, lines.adult, { franchises: [], models: [], everyOffer: true }).offers.some((o) => o.franchiseChf !== 2500)).toBe(true);

    setStrategy(db, scope, 1, "ECONOMY");
    saveNeeds(db, scope, 1, [
      { lineId: lines.adult, franchiseChf: null, models: ["TELMED", "STANDARD", "BOGUS"], healthCostsRp: 120_000, doctorName: "Dr Martin" },
    ], NOW);
    const cmp = compareForLine(db, scope, lines.adult);
    expect(cmp.effective).toEqual({ models: ["TELMED", "STANDARD"], franchiseChf: null });
    expect(cmp.healthCostsRp).toBe(120_000);
    view = getReviewView(db, scope, 1, TODAY);
    expect(view.review.strategy).toBe("ECONOMY");
    expect(view.steps.slice(0, 4).map((s) => s.done)).toEqual([true, true, true, false]);
    // On rend les modèles de départ pour la suite du scénario.
    saveNeeds(db, scope, 1, [{ lineId: lines.adult, franchiseChf: null, models: [], healthCostsRp: 50_000, doctorName: null }], NOW);
  });

  it("enregistre une signature dessinée et la retrouve par nom", () => {
    const alex = listSignatures(db, scope).find((s) => s.firstName === "Alex")!;
    expect(() => saveSignature(db, scope, alex.personId, "data:text/html;base64,AAAA")).toThrow(UserError);
    saveSignature(db, scope, alex.personId, "data:image/png;base64,iVBORw0KGgo=");
    expect(signaturesByName(db, scope)).toEqual({ "Alex Test": "data:image/png;base64,iVBORw0KGgo=" });
  });

  it("compare et décide", () => {
    const cmp = compareForLine(db, scope, lines.adult, { sort: "total" });
    expect(cmp.offers.length).toBeGreaterThan(3);
    expect(new Set(cmp.offers.map((o) => o.insurerId)).size).toBe(cmp.offers.length);
    expect(cmp.matchingOffers).toBeGreaterThan(cmp.offers.length);
    expect(cmp.offers[0]!.rank).toBe(1);
    expect(cmp.renewal?.franchiseChf).toBe(2500);
    expect(cmp.curve.points.length).toBeGreaterThan(10);
    const best = cmp.offers[0]!;
    expect(decide(db, scope, lines.adult, { tariffId: best.tariffId, franchiseChf: best.franchiseChf }, NOW)).toBe("SWITCH");

    const teenCmp = compareForLine(db, scope, lines.teen, { all: true, everyOffer: true });
    const sameInsurerOther = teenCmp.offers.find((o) => o.insurerId === insurerId(8) && o.tariffCode === "CSS-TEL")!;
    expect(decide(db, scope, lines.teen, { tariffId: sameInsurerOther.tariffId, franchiseChf: sameInsurerOther.franchiseChf }, NOW)).toBe("ADJUST");
  });

  it("prépare la demande d'offre à la nouvelle caisse, complémentaires comprises", () => {
    const ids = generateOfferRequests(db, scope, 1, TODAY);
    expect(ids).toHaveLength(1);
    const [req] = listOfferRequests(db, scope, 1);
    expect(req!.content.subject).toMatch(/Demande d'offre et d'affiliation .* 1er janvier 2027/);
    expect(req!.content.personRows[0]).toMatch(/^Alex Test, né·e le .*franchise CHF \d+, (avec|sans) couverture accident/);
    expect(req!.content.extraRows).toEqual(["Alex Test : hospitalisation demi-privée"]);
    expect(req!.content.mailing).toBeNull();

    // Complémentaires modifiées : la demande non envoyée est refaite.
    setLcaWishes(db, scope, lines.adult, ["HOSPITAL_SEMI_PRIVATE", "DENTAL", "bidon"]);
    expect(lcaWishesFor(db, { personId: 0, lcaWishes: ["DENTAL", "bidon"] })).toEqual(["DENTAL"]);
    generateOfferRequests(db, scope, 1, TODAY);
    const [again] = listOfferRequests(db, scope, 1);
    expect(listOfferRequests(db, scope, 1)).toHaveLength(1);
    expect(again!.content.extraRows).toEqual(["Alex Test : hospitalisation demi-privée, soins dentaires"]);

    // Envoyée : vaut demande d'affiliation, et n'est plus régénérée.
    markOfferRequestSent(db, scope, again!.id, TODAY);
    expect(getReviewView(db, scope, 1, TODAY).persons[0]!.line.affiliationRequestedAt).toBe(TODAY);
    expect(generateOfferRequests(db, scope, 1, TODAY)).toEqual([]);
  });

  it("refuse la résiliation sans contrôle LCA ; l'adresse officielle suffit", () => {
    const res = generateLetters(db, scope, 1, TODAY);
    // Noa change seulement de modèle chez CSS : l'adresse de l'annuaire officiel suffit.
    expect(res.created).toHaveLength(1);
    expect(getLetter(db, scope, res.created[0]!)!.content.insurerLines).toEqual(["CSS Assurance-maladie SA", "Tribschenstrasse 21", "Postfach 2568", "6002 Luzern"]);
    expect(res.blocked.map((b) => b.person)).toEqual(["Alex Test"]);
    expect(res.blocked[0]!.reasons.join(" ")).toMatch(/LCA/);
  });

  it("génère les lettres une fois les garde-fous levés", () => {
    acknowledgeLca(db, scope, lines.adult, NOW);
    saveInsurer(db, scope, { id: insurerId(1562), terminationAddress: "Case postale\n8081 Zurich" }, NOW);
    saveInsurer(db, scope, { id: insurerId(8), terminationAddress: "Case postale 2568\n6002 Lucerne" }, NOW);
    const res = generateLetters(db, scope, 1, TODAY);
    expect(res.blocked).toEqual([]);
    expect(res.created).toHaveLength(2);
    const termination = getLetter(db, scope, res.created[0]!)!;
    expect(termination.kind).toBe("TERMINATION");
    expect(termination.content.lcaClause).toMatch(/LCA/);
    expect(termination.content.insurerLines).toEqual(["Helsana Assurances SA", "Case postale", "8081 Zurich"]);
    expect(termination.content.personRows[0]).toMatch(/HEL-123/);
    // Régénérer remplace les lettres non envoyées.
    const again = generateLetters(db, scope, 1, TODAY);
    expect(again.created).toHaveLength(2);
    expect(getReviewView(db, scope, 1, TODAY).letters).toHaveLength(2);
    markLetterSent(db, scope, again.created[0]!, TODAY, "98.00.123456.12345678");
    expect(() => undoDecision(db, scope, lines.adult)).toThrow(UserError);
  });

  it("oublie les lettres non envoyées devenues obsolètes quand une décision change", () => {
    // Noa (changement de modèle, lettre non envoyée) revient à « je garde » : plus de lettre de changement.
    undoDecision(db, scope, lines.teen);
    keepAsIs(db, scope, lines.teen, NOW);
    const res = generateLetters(db, scope, 1, TODAY);
    expect(res.blocked).toEqual([]);
    expect(res.created).toEqual([]);
    const letters = getReviewView(db, scope, 1, TODAY).letters;
    expect(letters).toHaveLength(1);
    expect(letters[0]!.kind).toBe("TERMINATION");
    expect(letters[0]!.sentAt).toBe(TODAY);
    // On rétablit la décision du scénario (changement de modèle chez CSS).
    const teenCmp = compareForLine(db, scope, lines.teen, { all: true, everyOffer: true });
    const other = teenCmp.offers.find((o) => o.insurerId === insurerId(8) && o.tariffCode === "CSS-TEL")!;
    expect(decide(db, scope, lines.teen, { tariffId: other.tariffId, franchiseChf: other.franchiseChf }, NOW)).toBe("ADJUST");
    expect(generateLetters(db, scope, 1, TODAY).created).toHaveLength(1);
    expect(getReviewView(db, scope, 1, TODAY).letters).toHaveLength(2);
  });

  it("clôt la revue et crée les contrats de l'année suivante", () => {
    closeReview(db, scope, 1, NOW);
    const policies2027 = db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all();
    expect(policies2027).toHaveLength(2);
    expect(policies2027.find((p) => p.insurerId === insurerId(8))?.policyNumber).toBeNull();
    const history = householdHistory(db, scope);
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
    reopenReview(db, scope, 1);
    expect(getReviewByYear(db, scope, 2027)?.status).toBe("OPEN");
    expect(db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all()).toHaveLength(0);
    expect(getReviewView(db, scope, 1, TODAY).persons.every((p) => p.line.decision !== "UNDECIDED")).toBe(true);
    closeReview(db, scope, 1, NOW);
    expect(db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all()).toHaveLength(2);
  });

  it("à la clôture, un contrat de l'année cible déjà présent est mis à jour, sauf s'il est manuel", () => {
    reopenReview(db, scope, 1);
    const adult = getReviewView(db, scope, 1, TODAY).persons[0]!;
    const byPerson = and(eq(lamalPolicy.personId, adult.person.id), eq(lamalPolicy.coverageYear, 2027));
    const manualId = savePolicy(db, scope, {
      personId: adult.person.id, coverageYear: 2027, insurerId: insurerId(1562), policyNumber: "HEL-2027",
      tariffCode: null, tariffLabel: null, modelType: "STANDARD", franchiseChf: 300, accident: false, billedMonthlyRp: 45000,
    });
    expect(() => closeReview(db, scope, 1, NOW)).toThrow(/2027 saisi à la main existe déjà pour Alex/);
    expect(getReviewByYear(db, scope, 2027)?.status).toBe("OPEN");
    expect(db.select().from(lamalPolicy).where(byPerson).get()?.insurerId).toBe(insurerId(1562));

    // Importé (OFSP) : la décision l'emporte et le contrat est repris par la clôture.
    db.update(lamalPolicy).set({ source: "OFSP" }).where(eq(lamalPolicy.id, manualId)).run();
    closeReview(db, scope, 1, NOW);
    expect(getReviewByYear(db, scope, 2027)?.status).toBe("CLOSED");
    const updated = db.select().from(lamalPolicy).where(byPerson).get()!;
    expect(updated.id).toBe(manualId);
    expect(updated.source).toBe("REVIEW");
    expect(updated.insurerId).toBe(adult.line.chosenInsurerId);
    expect(updated.billedMonthlyRp).toBe(adult.line.chosenMonthlyRp);
    expect(db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all()).toHaveLength(2);
  });

  it("supprime un rituel clôturé et revient à l'état d'avant", () => {
    deleteReview(db, scope, 1);
    expect(getReviewByYear(db, scope, 2027)).toBeNull();
    expect(db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2027)).all()).toHaveLength(0);
    expect(db.select().from(lamalPolicy).where(eq(lamalPolicy.coverageYear, 2026)).all()).toHaveLength(2);
    const { reviewId } = openReview(db, scope, 2027);
    expect(getReviewView(db, scope, reviewId, TODAY).persons.every((p) => p.line.decision === "UNDECIDED")).toBe(true);
  });
});
