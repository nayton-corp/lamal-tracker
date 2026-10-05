import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { compareForLine } from "@/application/compare";
import { NotFoundError } from "@/application/errors";
import { householdHistory } from "@/application/history";
import {
  deleteLca,
  deletePerson,
  deletePolicy,
  getHousehold,
  getHouseholdMode,
  getPerson,
  listInsurers,
  listPolicies,
  resetHousehold,
  saveHousehold,
  saveInsurer,
  saveLca,
  savePerson,
  savePolicy,
  setHouseholdMode,
} from "@/application/household";
import { deleteLetter, generateLetters, getLetter, markLetterAcknowledged, markLetterSent } from "@/application/letters";
import {
  deleteOfferRequest,
  generateOfferRequests,
  getOfferRequest,
  listOfferRequests,
  markOfferRequestAnswered,
  markOfferRequestSent,
  setLcaWishes,
} from "@/application/offers";
import { abandonPingen, pingenReadiness } from "@/application/pingen";
import { applyPolicyImport } from "@/application/policy-import";
import {
  acknowledgeLca,
  activeReview,
  closeReview,
  confirmLineage,
  decide,
  deleteReview,
  getReviewByYear,
  getReviewView,
  keepAsIs,
  openReview,
  reopenReview,
  setLineFlags,
  undoDecision,
} from "@/application/review";
import { withHousehold, type Scope } from "@/application/scope";
import { deleteSignature, listSignatures, saveSignature, signaturesByName } from "@/application/signatures";
import { lineContext, saveNeeds, setStrategy, strategyOverview } from "@/application/strategy";
import { tariffOptions } from "@/application/tariffs";
import { openDb, type Db } from "@/infrastructure/db/client";
import { household, lamalPolicy, lcaPolicy, letter, offerRequest, person, review, reviewLine, signature, tariffLineage } from "@/infrastructure/db/schema";
import { importPremiumFile } from "@/infrastructure/ofsp/importer";
import { FIXTURES_DIR } from "../fixtures/generate";
import { testAccount } from "../accounts";

/*
 * Deux foyers dans la même base : aucun cas d'usage appelé par le foyer A ne doit lire ni modifier
 * une donnée du foyer B, même en lui passant les identifiants de B.
 */

const NOW = "2026-10-05T08:00:00.000Z";
const TODAY = "2026-10-05";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let db: Db;

interface Fixture {
  scope: Scope;
  personId: number;
  policyId: number;
  lcaId: number;
  reviewId: number;
  lineId: number;
  letterId: number;
  offerId: number;
}

function insurerId(bag: number) {
  return listInsurers(db).find((i) => i.bagNumber === bag)!.id;
}

/** Un foyer complet : personne, contrat, complémentaire, signature, rituel décidé, lettre et demande d'offre. */
function household_(name: string): Fixture {
  let scope = testAccount(db);
  scope = withHousehold(scope, saveHousehold(db, scope, { name, street: "Rue du Lac 1", postalCode: "1003", city: "Lausanne", canton: "VD", region: 1 }));
  setHouseholdMode(db, scope, "SOLO");
  const personId = savePerson(db, scope, { firstName: name, lastName: "Test", birthDate: "1988-04-12", healthCostsRp: 50000 });
  const policyId = savePolicy(db, scope, {
    personId, coverageYear: 2026, insurerId: insurerId(1562), policyNumber: "HEL-123",
    tariffCode: "HEL-TEL26", tariffLabel: "Telmed HEL", modelType: "TELMED", franchiseChf: 2500, accident: false, billedMonthlyRp: 39000,
  });
  const lcaId = saveLca(db, scope, { personId, insurerName: "Helsana", linkedInsurerId: insurerId(1562), guarantee: "HOSPITAL_SEMI_PRIVATE" });
  saveSignature(db, scope, personId, PNG);
  const { reviewId } = openReview(db, scope, 2027);
  const pr = getReviewView(db, scope, reviewId, TODAY).persons[0]!;
  decide(db, scope, pr.line.id, { tariffId: pr.best!.tariffId, franchiseChf: pr.best!.franchiseChf }, NOW);
  acknowledgeLca(db, scope, pr.line.id, NOW);
  const [offerId] = generateOfferRequests(db, scope, reviewId, TODAY);
  markOfferRequestSent(db, scope, offerId!, TODAY);
  const { created } = generateLetters(db, scope, reviewId, TODAY);
  return { scope, personId, policyId, lcaId, reviewId, lineId: pr.line.id, letterId: created[0]!, offerId: offerId! };
}

let a: Fixture;
let b: Fixture;

/** Photographie des lignes du foyer B : elle ne doit pas bouger. */
function snapshotOf(f: Fixture) {
  return JSON.stringify({
    household: db.select().from(household).all().filter((h) => h.id === f.scope.householdId),
    person: db.select().from(person).all().filter((p) => p.id === f.personId),
    policy: db.select().from(lamalPolicy).all().filter((p) => p.personId === f.personId),
    lca: db.select().from(lcaPolicy).all().filter((l) => l.personId === f.personId),
    signature: db.select().from(signature).all().filter((s) => s.personId === f.personId),
    review: db.select().from(review).all().filter((r) => r.id === f.reviewId),
    lines: db.select().from(reviewLine).all().filter((l) => l.reviewId === f.reviewId),
    letters: db.select().from(letter).all().filter((l) => l.reviewId === f.reviewId),
    offers: db.select().from(offerRequest).all().filter((o) => o.reviewId === f.reviewId),
    lineage: db.select().from(tariffLineage).all().filter((l) => l.householdId === f.scope.householdId),
  });
}

beforeAll(async () => {
  db = openDb(":memory:");
  await importPremiumFile(db, path.join(FIXTURES_DIR, "primes-2026.xlsx"), "test");
  await importPremiumFile(db, path.join(FIXTURES_DIR, "primes-2027.xlsx"), "test");
  a = household_("Alex");
  b = household_("Bea");
});

describe("cloisonnement des foyers", () => {
  it("chaque foyer ne voit que ses propres données", () => {
    expect(getHousehold(db, a.scope)!.name).toBe("Alex");
    expect(getHousehold(db, b.scope)!.name).toBe("Bea");
    expect(getPerson(db, a.scope, b.personId)).toBeNull();
    expect(getReviewByYear(db, a.scope, 2027)!.id).toBe(a.reviewId);
    expect(activeReview(db, a.scope)!.id).toBe(a.reviewId);
    expect(getLetter(db, a.scope, b.letterId)).toBeNull();
    expect(getOfferRequest(db, a.scope, b.offerId)).toBeNull();
    expect(listSignatures(db, a.scope).map((s) => s.personId)).toEqual([a.personId]);
    expect(Object.keys(signaturesByName(db, a.scope))).toEqual(["Alex Test"]);
    expect(householdHistory(db, a.scope).persons.map((p) => p.personId)).toEqual([a.personId]);
    expect(tariffOptions(db, a.scope, b.personId, 2026, insurerId(1562)).available).toBe(false);
    expect(pingenReadiness(db, a.scope, getLetter(db, b.scope, b.letterId)!.content)).toEqual([expect.stringMatching(/Signature à l'écran manquante : Bea Test/)]);
  });

  it("un compte sans foyer ne voit rien", () => {
    const none = testAccount(db);
    expect(getHousehold(db, none)).toBeNull();
    expect(getHouseholdMode(db, none)).toBeNull();
    expect(getPerson(db, none, a.personId)).toBeNull();
    expect(getReviewByYear(db, none, 2027)).toBeNull();
    expect(listSignatures(db, none)).toEqual([]);
    expect(() => getReviewView(db, none, a.reviewId, TODAY)).toThrow(NotFoundError);
    expect(() => savePerson(db, none, { firstName: "X", lastName: "Y", birthDate: "1990-01-01" })).toThrow(/Configurez d'abord le foyer/);
  });

  it("refuse toute lecture ou modification des objets d'un autre foyer, sans rien changer", () => {
    const before = snapshotOf(b);
    const s = a.scope;
    const attempts: [string, () => unknown][] = [
      ["getReviewView", () => getReviewView(db, s, b.reviewId, TODAY)],
      ["strategyOverview", () => strategyOverview(db, s, b.reviewId)],
      ["lineContext", () => lineContext(db, s, b.lineId)],
      ["compareForLine", () => compareForLine(db, s, b.lineId)],
      ["listOfferRequests", () => listOfferRequests(db, s, b.reviewId)],
      ["savePerson", () => savePerson(db, s, { id: b.personId, firstName: "Pirate", lastName: "X", birthDate: "1990-01-01" })],
      ["deletePerson", () => deletePerson(db, s, b.personId)],
      ["savePolicy (personne)", () => savePolicy(db, s, { personId: b.personId, coverageYear: 2025, insurerId: insurerId(8), modelType: "STANDARD", franchiseChf: 300, accident: true, billedMonthlyRp: 1 })],
      ["savePolicy (contrat)", () => savePolicy(db, s, { id: b.policyId, personId: a.personId, coverageYear: 2025, insurerId: insurerId(8), modelType: "STANDARD", franchiseChf: 300, accident: true, billedMonthlyRp: 1 })],
      ["deletePolicy", () => deletePolicy(db, s, b.policyId)],
      ["saveLca (personne)", () => saveLca(db, s, { personId: b.personId, insurerName: "X", guarantee: "DENTAL" })],
      ["saveLca (contrat)", () => saveLca(db, s, { id: b.lcaId, personId: a.personId, insurerName: "X", guarantee: "DENTAL" })],
      ["deleteLca", () => deleteLca(db, s, b.lcaId)],
      ["saveSignature", () => saveSignature(db, s, b.personId, PNG)],
      ["deleteSignature", () => deleteSignature(db, s, b.personId)],
      ["applyPolicyImport", () => applyPolicyImport(db, s, { insurerId: insurerId(8), year: 2025, persons: [{ personId: b.personId, tariffCode: null, tariffLabel: null, modelType: "STANDARD", franchiseChf: 300, accident: true, billedMonthlyRp: 1, policyNumber: null, lca: [] }] })],
      ["confirmLineage", () => confirmLineage(db, s, b.lineId, "HEL-TEL")],
      ["decide", () => decide(db, s, b.lineId, { tariffId: 1, franchiseChf: 300 }, NOW)],
      ["keepAsIs", () => keepAsIs(db, s, b.lineId, NOW)],
      ["undoDecision", () => undoDecision(db, s, b.lineId)],
      ["acknowledgeLca", () => acknowledgeLca(db, s, b.lineId, NOW)],
      ["setLineFlags", () => setLineFlags(db, s, b.lineId, { doctorCheck: "NO" })],
      ["setLcaWishes", () => setLcaWishes(db, s, b.lineId, ["DENTAL"])],
      ["setStrategy", () => setStrategy(db, s, b.reviewId, "ECONOMY")],
      ["saveNeeds (rituel)", () => saveNeeds(db, s, b.reviewId, [], NOW)],
      ["saveNeeds (ligne)", () => saveNeeds(db, s, a.reviewId, [{ lineId: b.lineId, franchiseChf: 300, models: [], healthCostsRp: 0, doctorName: null }], NOW)],
      ["generateLetters", () => generateLetters(db, s, b.reviewId, TODAY)],
      ["generateOfferRequests", () => generateOfferRequests(db, s, b.reviewId, TODAY)],
      ["markLetterSent", () => markLetterSent(db, s, b.letterId, TODAY, "X")],
      ["markLetterAcknowledged", () => markLetterAcknowledged(db, s, b.letterId, TODAY)],
      ["abandonPingen", () => abandonPingen(db, s, b.letterId)],
      ["markOfferRequestSent", () => markOfferRequestSent(db, s, b.offerId, null)],
      ["markOfferRequestAnswered", () => markOfferRequestAnswered(db, s, b.offerId, TODAY)],
      ["closeReview", () => closeReview(db, s, b.reviewId, NOW)],
      ["reopenReview", () => reopenReview(db, s, b.reviewId)],
    ];
    for (const [name, attempt] of attempts) {
      expect(attempt, name).toThrow(NotFoundError);
    }
    // Suppressions « silencieuses » : rien ne se passe pour un objet d'autrui.
    deleteLetter(db, s, b.letterId);
    deleteOfferRequest(db, s, b.offerId);
    deleteReview(db, s, b.reviewId);
    expect(snapshotOf(b)).toBe(before);
  });

  it("les correspondances de tarifs confirmées restent propres au foyer", () => {
    confirmLineage(db, a.scope, a.lineId, "HEL-TEL");
    expect(db.select().from(tariffLineage).all().map((l) => l.householdId)).toEqual([a.scope.householdId]);
    expect(getReviewView(db, b.scope, b.reviewId, TODAY).persons[0]!.line.renewalStatus).not.toBe("MATCHED");
  });

  it("les coordonnées des caisses, partagées, sont réservées à l'administrateur", () => {
    expect(() => saveInsurer(db, a.scope, { id: insurerId(8), terminationAddress: "Ailleurs" }, NOW)).toThrow(/administrateur/);
    saveInsurer(db, testAccount(db, "ADMIN"), { id: insurerId(8), website: "https://css.ch" }, NOW);
  });

  it("la remise à zéro n'efface que le foyer de l'appelant", () => {
    const before = snapshotOf(b);
    resetHousehold(db, a.scope);
    expect(getHousehold(db, a.scope)).toBeNull();
    expect(listPolicies(db, a.personId)).toEqual([]);
    expect(snapshotOf(b)).toBe(before);
  });
});
