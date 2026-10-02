import { beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "@/application/context";
import { closeReview, householdHistory } from "@/application/history";
import { createPerson, savePolicy, saveHousehold, saveLcaPolicy, savePrefs } from "@/application/household";
import { activateDataset, discardDataset, importTariffFile, ImportError } from "@/application/import-tariffs";
import { deleteLetter, generateLetter, letterContent, markInsurerAck, markLetterSent } from "@/application/letters";
import {
  acknowledgeLca,
  chooseOffer,
  confirmRenewal,
  keepCurrent,
  letterGroups,
  offersForLine,
  openReview,
  resetDecision,
  reviewOverview,
  setAffiliation,
} from "@/application/review";
import { fixtureBytes } from "../fixtures/ofsp";
import { testContext } from "../helpers";

const fakePdf = async () => new TextEncoder().encode("%PDF-1.4 fake");

function importYear(ctx: AppContext, year: number, opts: Parameters<typeof fixtureBytes>[0] extends infer O ? Partial<O> : never = {}) {
  const r = importTariffFile(ctx, {
    fileName: `praemien_${year}.csv`,
    bytes: fixtureBytes({ year, ...opts }),
    sourceLabel: "test",
    sourceUrl: null,
  });
  activateDataset(ctx, r.datasetId);
  return r;
}

describe("import des primes", () => {
  it("importe, valide et compare à l'année précédente", () => {
    const ctx = testContext();
    const r2026 = importYear(ctx, 2026);
    expect(r2026.report.rowsRejected).toBe(0);
    expect(r2026.report.year).toBe(2026);
    expect(r2026.report.byCanton).toMatchObject({ VD: expect.any(Number), GE: expect.any(Number) });
    expect(r2026.report.blocking).toEqual([]);
    expect(r2026.report.yearOverYear).toBeNull();

    const r2027 = importYear(ctx, 2027, { inflation: 1.06 });
    expect(r2027.report.yearOverYear?.previousYear).toBe(2026);
    expect(r2027.report.yearOverYear?.medianChangeBp).toBeGreaterThan(550);
    expect(r2027.report.yearOverYear?.medianChangeBp).toBeLessThan(650);
    expect(ctx.tariffs.activeYears()).toEqual([2026, 2027]);
  });

  it("est idempotent sur le même fichier", () => {
    const ctx = testContext();
    const first = importYear(ctx, 2026);
    const again = importTariffFile(ctx, { fileName: "x.csv", bytes: fixtureBytes({ year: 2026 }), sourceLabel: "t", sourceUrl: null });
    expect(again.duplicateOf).toBe(first.datasetId);
    expect(ctx.tariffs.listDatasets()).toHaveLength(1);
  });

  it("remplace le jeu actif de la même année et refuse l'abandon d'un jeu actif", () => {
    const ctx = testContext();
    const a = importYear(ctx, 2027);
    const b = importYear(ctx, 2027, { inflation: 1.01 });
    expect(ctx.tariffs.getDataset(a.datasetId)?.status).toBe("SUPERSEDED");
    expect(ctx.tariffs.activeDataset(2027)?.id).toBe(b.datasetId);
    expect(() => discardDataset(ctx, b.datasetId)).toThrow(ImportError);
  });

  it("bloque l'activation d'un fichier trop abîmé", () => {
    const ctx = testContext();
    const text = new TextDecoder().decode(fixtureBytes({ year: 2027 }, "utf-8"));
    const broken = text
      .split("\r\n")
      .map((l, i) => (i > 0 && i % 10 === 0 ? l.replace("OHN-UNF", "???").replace("MIT-UNF", "???") : l))
      .join("\r\n");
    const r = importTariffFile(ctx, { fileName: "p2027.csv", bytes: new TextEncoder().encode(broken), sourceLabel: "t", sourceUrl: null });
    expect(r.report.blocking.length).toBeGreaterThan(0);
    expect(() => activateDataset(ctx, r.datasetId)).toThrow(/Activation impossible/);
  });

  it("exige l'année quand le fichier ne la contient pas", () => {
    const ctx = testContext();
    const text = "Versicherer;Kanton;Region;Altersklasse;Unfalleinschluss;Franchise;Prämie\n8;VD;1;AKL-ERW;OHN-UNF;300;400.00\n";
    expect(() => importTariffFile(ctx, { fileName: "p.csv", bytes: new TextEncoder().encode(text), sourceLabel: "t", sourceUrl: null })).toThrow(
      /année/,
    );
    const ok = importTariffFile(ctx, { fileName: "p.csv", bytes: new TextEncoder().encode(text), sourceLabel: "t", sourceUrl: null, yearHint: 2027 });
    expect(ok.report.year).toBe(2027);
  });
});

describe("rituel annuel complet", () => {
  let ctx: ReturnType<typeof testContext>;
  let nathan: number;
  let lea: number;

  beforeEach(() => {
    ctx = testContext("2026-10-05");
    importYear(ctx, 2026);
    // 2027 : la CSS renomme son produit Telmed.
    importYear(ctx, 2027, { inflation: 1.07, renames: { "8:TEL-MED": "TEL-MED-2" } });
    ctx.reference.upsertInsurer(8, "CSS", "USER");
    ctx.reference.upsertInsurer(1542, "Assura", "USER");
    ctx.reference.saveAddress({
      insurerId: 8,
      validFromYear: 2000,
      recipientName: "CSS Kranken-Versicherung AG",
      addressLines: ["Case postale 2568", "6002 Lucerne"],
      source: "test",
      verifiedAt: null,
    });
    saveHousehold(ctx, { name: "Foyer", street: "Rue du Lac 1", npa: "1000", locality: "Lausanne", canton: "VD", region: 1 });
    nathan = createPerson(ctx, { firstName: "Nathan", lastName: "Exemple", birthDate: "1990-05-01" });
    lea = createPerson(ctx, { firstName: "Léa", lastName: "Exemple", birthDate: "2008-03-10" }); // 19 ans en 2027
  });

  function addPolicies() {
    const t2026 = ctx.tariffs
      .tariffs({ datasetId: ctx.tariffs.activeDataset(2026)!.id, canton: "VD", region: 1, ageClass: "ADULT", accidentIncluded: false, insurerId: 8 })
      .find((t) => t.tariffCode === "BASE" && t.franchiseChf === 2500)!;
    const nathanPolicy = savePolicy(ctx, {
      personId: nathan,
      coverageYear: 2026,
      insurerId: 8,
      policyNumber: "CSS-111",
      modelType: "STANDARD",
      franchiseChf: 2500,
      accidentIncluded: false,
      billedMonthlyRp: t2026.monthlyPremiumRp,
    });
    expect(nathanPolicy.match?.confidence).toBe("EXACT");
    const leaTariff = ctx.tariffs
      .tariffs({ datasetId: ctx.tariffs.activeDataset(2026)!.id, canton: "VD", region: 1, ageClass: "KID", accidentIncluded: true, insurerId: 8 })
      .find((t) => t.tariffCode === "TEL-MED" && t.franchiseChf === 600 && t.ageSubgroup === "K1")!;
    const leaPolicy = savePolicy(ctx, {
      personId: lea,
      coverageYear: 2026,
      insurerId: 8,
      policyNumber: "CSS-112",
      modelType: "TELMED",
      franchiseChf: 600,
      accidentIncluded: true,
      billedMonthlyRp: leaTariff.monthlyPremiumRp,
    });
    expect(leaPolicy.match?.confidence).toBe("EXACT");
    return { nathanPolicy, leaPolicy };
  }

  it("ouvre le rituel, retrouve les renouvellements et signale les cas à confirmer", () => {
    addPolicies();
    const reviewId = openReview(ctx, 2027);
    expect(openReview(ctx, 2027)).toBe(reviewId); // idempotent
    const o = reviewOverview(ctx, reviewId);
    expect(o.review.deadlineDate).toBe("2026-11-30");
    expect(o.review.recommendedSendBy).toBe("2026-11-24");
    expect(o.countdown.daysLeft).toBe(50);

    const n = o.lines.find((l) => l.person.id === nathan)!;
    expect(n.line.renewalConfidence).toBe("EXACT");
    expect(n.change!.changeBp).toBeGreaterThan(650);
    expect(n.best).not.toBeNull();
    expect(n.potentialSavingRp).toBeGreaterThan(0);
    expect(n.market!.total).toBeGreaterThan(5);

    const l = o.lines.find((x) => x.person.id === lea)!;
    expect(l.ageClass).toBe("YOUNG");
    expect(l.ageClassWarning).toContain("jeune adulte");
    // Telmed renommé : pas de code identique, un seul produit Telmed → probable
    expect(l.line.renewalConfidence).toBe("PROBABLE");
    expect(l.line.renewalFranchiseChf).toBe(500); // franchise enfant 600 → adulte 500
    expect(l.alerts.join(" ")).toContain("probable");
    expect(o.totals.deltaMonthlyRp).toBeGreaterThan(0);
  });

  it("refuse d'ouvrir un rituel sans tarifs actifs", () => {
    expect(() => openReview(ctx, 2028)).toThrow(/Aucun tarif OFSP 2028/);
  });

  it("parcourt décision → garde-fou LCA → lettre → envoi → clôture", async () => {
    addPolicies();
    saveLcaPolicy(ctx, null, {
      personId: nathan,
      insurerId: 8,
      productName: "Hospital Flex",
      category: "HOSPITAL",
      noticeMonths: 3,
      bundledDiscount: true,
      monthlyRp: 4500,
    });
    savePrefs(ctx, nathan, { allowedModels: [], allowedFranchises: [2500], expectedHealthCostsRp: 30000, accidentIncluded: false, excludedInsurers: [8] });
    const reviewId = openReview(ctx, 2027);
    const [nLine, lLine] = ["n", "l"].map((k) =>
      reviewOverview(ctx, reviewId).lines.find((x) => x.person.id === (k === "n" ? nathan : lea))!.line,
    );

    // Comparateur : filtres de préférences (caisse actuelle exclue, franchise 2500)
    const offers = offersForLine(ctx, nLine!.id, { sortBy: "premium" });
    expect(offers.offers.every((o) => o.tariff.insurerId !== 8 && o.tariff.franchiseChf === 2500)).toBe(true);
    expect(offers.offers[0]!.annualSavingRp).toBeGreaterThan(0);
    const pick = offers.offers.find((o) => o.tariff.insurerId === 1542)!;

    // Léa : confirmer le renouvellement puis rester
    const leaRenewal = ctx.tariffs.tariffById(lLine!.renewalTariffId!)!;
    confirmRenewal(ctx, lLine!.id, leaRenewal.id);
    expect(ctx.tariffs.lineageMap([8], 2026, 2027).get("8:TEL-MED")).toBe("TEL-MED-2");
    keepCurrent(ctx, lLine!.id);

    expect(chooseOffer(ctx, nLine!.id, pick.tariff.id)).toBe("SWITCH");
    expect(reviewOverview(ctx, reviewId).review.status).toBe("DECIDED");
    expect(reviewOverview(ctx, reviewId).needsLca).toBe(true);

    // Sans garde-fou LCA : pas de lettre
    let group = letterGroups(ctx, reviewId)[0]!;
    expect(group.check.ok).toBe(false);
    expect(group.check.reasons.join(" ")).toContain("LCA");
    await expect(generateLetter(ctx, reviewId, 8, fakePdf)).rejects.toThrow(/LCA/);

    // Le trigger SQL bloque même un contournement du domaine
    expect(() => ctx.reviews.createLetter({ reviewId, insurerId: 8, pdfSha256: "x", pdfPath: "x" }, [nLine!.id])).toThrow(
      /INVARIANT_LETTER/,
    );

    acknowledgeLca(ctx, nLine!.id);
    group = letterGroups(ctx, reviewId)[0]!;
    expect(group.check).toEqual({ ok: true, reasons: [] });
    const content = letterContent(ctx, reviewId, 8);
    expect(content.recipientBlock[0]).toBe("CSS Kranken-Versicherung AG");
    expect(content.paragraphs.join(" ")).toContain("Assura vous confirmera");
    expect(content.personsTable).toEqual([{ name: "Nathan Exemple", birthDate: "01.05.1990", policyNumber: "CSS-111" }]);

    const letterId = await generateLetter(ctx, reviewId, 8, fakePdf);
    expect(ctx.files.files.size).toBe(1);
    // Régénération : remplace la lettre non envoyée
    const letterId2 = await generateLetter(ctx, reviewId, 8, fakePdf);
    expect(ctx.reviews.letter(letterId)).toBeUndefined();

    // Décision verrouillée tant que la lettre existe (domaine + trigger)
    expect(() => resetDecision(ctx, nLine!.id)).toThrow(/lettre/);
    expect(() => ctx.reviews.updateLine(nLine!.id, { lcaAckAt: null })).toThrow(/INVARIANT_LETTER_LOCK/);

    markLetterSent(ctx, letterId2, { sentOn: "2026-10-20", trackingNo: "98.34 1234 5678" });
    expect(ctx.reviews.letter(letterId2)!.trackingNo).toBe("98.3412345678");
    expect(reviewOverview(ctx, reviewId).review.status).toBe("LETTERS_SENT");
    expect(() => deleteLetter(ctx, letterId2)).toThrow(/envoyée/);
    await expect(generateLetter(ctx, reviewId, 8, fakePdf)).rejects.toThrow(/déjà été envoyée/);

    setAffiliation(ctx, nLine!.id, { requested: true, confirmed: true, newPolicyNumber: "AS-999" });
    markInsurerAck(ctx, letterId2, "2026-10-28");
    expect(reviewOverview(ctx, reviewId).review.status).toBe("CONFIRMED");

    closeReview(ctx, reviewId);
    expect(ctx.reviews.review(reviewId)!.status).toBe("CLOSED");
    const p2027 = ctx.household.policyFor(nathan, 2027)!;
    expect(p2027).toMatchObject({ insurerId: 1542, policyNumber: "AS-999", source: "REVIEW", franchiseChf: 2500 });
    expect(ctx.household.policyFor(lea, 2027)).toMatchObject({ insurerId: 8, policyNumber: "CSS-112", franchiseChf: 500 });
    expect(() => chooseOffer(ctx, nLine!.id, pick.tariff.id)).toThrow(/clôturé/);

    const history = householdHistory(ctx);
    expect(history.years).toEqual([2026, 2027]);
    const nh = history.people.find((p) => p.personId === nathan)!;
    expect(nh.points.map((p) => p.year)).toEqual([2026, 2027]);
    expect(nh.points[0]!.marketMedianRp).not.toBeNull();
    expect(history.totals[1]!.projected).toBe(false);
  });

  it("refuse les décisions incohérentes", () => {
    addPolicies();
    const reviewId = openReview(ctx, 2027);
    const line = reviewOverview(ctx, reviewId).lines.find((l) => l.person.id === nathan)!.line;
    const same = offersForLine(ctx, line.id, { onePerProduct: false }).offers.find(
      (o) => o.tariff.insurerId === 8 && o.tariff.tariffCode === "BASE" && o.tariff.franchiseChf === 300,
    )!;
    expect(chooseOffer(ctx, line.id, same.tariff.id)).toBe("CHANGE_FRANCHISE");
    expect(() => acknowledgeLca(ctx, line.id)).toThrow(/changement de caisse/);
    expect(() => chooseOffer(ctx, line.id, same.tariff.id, "SWITCH")).toThrow(/caisse actuelle/);
    resetDecision(ctx, line.id);
    expect(ctx.reviews.line(line.id)!.decision).toBeNull();
  });
});
