import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bestPerProduct, marketRank, marketStats, rankOffers, type ComparisonCriteria } from "@/domain/comparison/rank";
import { findRenewal, matchPolicyToTariff } from "@/domain/comparison/renewal";
import { expectedAnnualCost, franchiseCurve, recommendFranchise, worstCaseAnnualCost } from "@/domain/cost-model";
import { classifyModel } from "@/domain/insurance-model";
import { closestAllowedFranchise, defaultLamalParameters } from "@/domain/lamal-parameters";
import type { Tariff } from "@/domain/tariff";

const params = defaultLamalParameters(2027);

let nextId = 1;
function tariff(partial: Partial<Tariff>): Tariff {
  return {
    id: nextId++,
    datasetId: 1,
    year: 2027,
    insurerId: 8,
    insurerName: "CSS",
    canton: "VD",
    region: 1,
    ageClass: "ADULT",
    ageSubgroup: "",
    accidentIncluded: false,
    modelType: "STANDARD",
    tariffCode: "BASE",
    tariffLabel: "Standard",
    franchiseChf: 300,
    monthlyPremiumRp: 50000,
    ...partial,
  };
}

describe("coût annuel attendu", () => {
  const base = { coinsuranceRateBp: 1000, coinsuranceMaxRp: 70000, co2AnnualRp: 6000 };

  it("applique franchise, quote-part plafonnée et redistribution", () => {
    // 400.00/mois, franchise 2500, frais 5000 → 4800 + 2500 + min(250, 700) − 60
    const c = expectedAnnualCost({ ...base, monthlyPremiumRp: 40000, franchiseChf: 2500, healthCostsRp: 500000 });
    expect(c.premiumsRp).toBe(480000);
    expect(c.franchisePartRp).toBe(250000);
    expect(c.coinsurancePartRp).toBe(25000);
    expect(c.netPremiumsRp).toBe(474000);
    expect(c.totalRp).toBe(480000 + 250000 + 25000 - 6000);
  });

  it("plafonne la quote-part", () => {
    const c = expectedAnnualCost({ ...base, monthlyPremiumRp: 40000, franchiseChf: 300, healthCostsRp: 5_000_000 });
    expect(c.coinsurancePartRp).toBe(70000);
  });

  it("ne dépasse jamais le pire cas et croît avec les frais de santé", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200_000 }),
        fc.constantFrom(300, 500, 1000, 1500, 2000, 2500),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (premium, franchise, d1, d2) => {
          const input = { ...base, monthlyPremiumRp: premium, franchiseChf: franchise };
          const low = expectedAnnualCost({ ...input, healthCostsRp: Math.min(d1, d2) }).totalRp;
          const high = expectedAnnualCost({ ...input, healthCostsRp: Math.max(d1, d2) }).totalRp;
          expect(low).toBeLessThanOrEqual(high);
          expect(high).toBeLessThanOrEqual(worstCaseAnnualCost(input));
        },
      ),
    );
  });
});

describe("recommandation de franchise", () => {
  const options = [
    { franchiseChf: 300, monthlyPremiumRp: 50000 },
    { franchiseChf: 1500, monthlyPremiumRp: 41000 },
    { franchiseChf: 2500, monthlyPremiumRp: 36000 },
  ];

  it("recommande la franchise haute pour peu de frais", () => {
    const r = recommendFranchise(options, params, "ADULT", 20000)!;
    expect(r.franchiseChf).toBe(2500);
    expect(r.switchBelowAtRp).not.toBeNull();
    // Au-delà du seuil, une franchise plus basse doit vraiment être meilleure.
    const above = recommendFranchise(options, params, "ADULT", r.switchBelowAtRp! + 100)!;
    expect(above.franchiseChf).toBeLessThan(2500);
  });

  it("recommande la franchise basse pour de gros frais", () => {
    expect(recommendFranchise(options, params, "ADULT", 1_000_000)!.franchiseChf).toBe(300);
  });

  it("ignore les franchises non autorisées pour la classe d'âge", () => {
    expect(recommendFranchise([{ franchiseChf: 600, monthlyPremiumRp: 1 }], params, "ADULT", 0)).toBeNull();
  });

  it("la courbe désigne la franchise la moins chère à chaque point", () => {
    const curve = franchiseCurve(options, params, "ADULT", 800000, 20);
    expect(curve).toHaveLength(21);
    for (const p of curve) {
      const min = Math.min(...Object.values(p.costs));
      expect(p.costs[p.bestFranchiseChf]).toBe(min);
    }
  });

  it("passe à la franchise adulte la plus proche", () => {
    expect(closestAllowedFranchise(params, "YOUNG", 600)).toBe(500);
    expect(closestAllowedFranchise(params, "YOUNG", 0)).toBe(300);
    expect(closestAllowedFranchise(params, "ADULT", 1500)).toBe(1500);
  });
});

describe("classement des offres", () => {
  const tariffs = [
    tariff({ insurerId: 8, insurerName: "CSS", franchiseChf: 2500, monthlyPremiumRp: 38000 }),
    tariff({ insurerId: 8, insurerName: "CSS", franchiseChf: 300, monthlyPremiumRp: 52000 }),
    tariff({ insurerId: 1542, insurerName: "Assura", modelType: "TELMED", tariffCode: "TEL", franchiseChf: 2500, monthlyPremiumRp: 33000 }),
    tariff({ insurerId: 1542, insurerName: "Assura", modelType: "TELMED", tariffCode: "TEL", franchiseChf: 2500, monthlyPremiumRp: 30000, accidentIncluded: true }),
    tariff({ insurerId: 1384, insurerName: "Swica", modelType: "HMO", tariffCode: "HMO", franchiseChf: 2500, monthlyPremiumRp: 34000 }),
    tariff({ insurerId: 1384, insurerName: "Swica", ageClass: "KID", franchiseChf: 0, monthlyPremiumRp: 10000 }),
  ];
  const criteria: ComparisonCriteria = {
    ageClass: "ADULT",
    accidentIncluded: false,
    allowedModels: [],
    allowedFranchises: [],
    excludedInsurerIds: [],
    healthCostsRp: 50000,
    co2AnnualRp: null,
    sortBy: "premium",
  };

  it("filtre par profil puis trie par prime", () => {
    const ranked = rankOffers(tariffs, params, criteria, { monthlyPremiumRp: 38000, franchiseChf: 2500 });
    expect(ranked.map((r) => r.tariff.monthlyPremiumRp)).toEqual([33000, 34000, 38000, 52000]);
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[0]!.premiumSavingRp).toBe(60000);
    expect(ranked[0]!.annualSavingRp).toBe(60000);
  });

  it("respecte les modèles et caisses exclus", () => {
    const ranked = rankOffers(tariffs, params, { ...criteria, allowedModels: ["STANDARD", "HMO"], excludedInsurerIds: [1384] }, null);
    expect(ranked.every((r) => r.tariff.insurerId === 8)).toBe(true);
    expect(ranked[0]!.annualSavingRp).toBeNull();
  });

  it("le tri par coût attendu intègre la franchise", () => {
    const ranked = rankOffers(tariffs, params, { ...criteria, sortBy: "expectedCost", healthCostsRp: 1_000_000 }, null);
    // Avec 10 000 de frais : Telmed 2500 (3960 + 2500 + 700 = 7160) puis CSS 300 (6240 + 300 + 700 = 7240),
    // devant HMO 2500 (7280) alors que sa prime est plus basse.
    expect(ranked.map((r) => r.cost.totalRp)).toEqual([716000, 724000, 728000, 776000]);
    expect(ranked[1]!.tariff.franchiseChf).toBe(300);
  });

  it("une carte par produit", () => {
    const ranked = bestPerProduct(rankOffers(tariffs, params, criteria, null));
    expect(ranked.map((r) => r.tariff.tariffCode)).toEqual(["TEL", "HMO", "BASE"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("est déterministe quel que soit l'ordre d'entrée", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(tariffs, { minLength: tariffs.length }), (shuffled) => {
        const a = rankOffers(shuffled, params, criteria, null).map((r) => r.tariff.id);
        const b = rankOffers(tariffs, params, criteria, null).map((r) => r.tariff.id);
        expect(a).toEqual(b);
      }),
    );
  });

  it("statistiques de marché", () => {
    expect(marketStats([3, 1, 2])).toEqual({ count: 3, minRp: 1, medianRp: 2, maxRp: 3 });
    expect(marketStats([1, 2, 3, 4])!.medianRp).toBe(3);
    expect(marketStats([])).toBeNull();
    expect(marketRank([10, 20, 30], 20)).toEqual({ rank: 2, total: 3 });
  });
});

describe("renouvellement", () => {
  const next = [
    tariff({ insurerId: 8, tariffCode: "BASE", franchiseChf: 2500, monthlyPremiumRp: 41000 }),
    tariff({ insurerId: 8, tariffCode: "BASE", franchiseChf: 500, monthlyPremiumRp: 49000, ageClass: "YOUNG" }),
    tariff({ insurerId: 8, tariffCode: "HAM-NEW", modelType: "FAMILY_DOCTOR", tariffLabel: "Hausarzt", franchiseChf: 2500, monthlyPremiumRp: 37000 }),
    tariff({ insurerId: 8, tariffCode: "HAM-2", modelType: "FAMILY_DOCTOR", tariffLabel: "Hausarzt Plus", franchiseChf: 2500, monthlyPremiumRp: 36000 }),
  ];

  it("retrouve le même code tarifaire", () => {
    const r = findRenewal(
      { insurerId: 8, tariffCode: "BASE", tariffLabel: null, modelType: "STANDARD", franchiseChf: 2500, accidentIncluded: false, monthlyPremiumRp: 39000 },
      next,
      params,
      "ADULT",
      new Map(),
    );
    expect(r.confidence).toBe("EXACT");
    expect(r.tariff?.monthlyPremiumRp).toBe(41000);
  });

  it("suit la lignée confirmée d'un produit renommé", () => {
    const r = findRenewal(
      { insurerId: 8, tariffCode: "HAM-OLD", tariffLabel: null, modelType: "FAMILY_DOCTOR", franchiseChf: 2500, accidentIncluded: false, monthlyPremiumRp: null },
      next,
      params,
      "ADULT",
      new Map([["8:HAM-OLD", "HAM-NEW"]]),
    );
    expect(r.confidence).toBe("LINEAGE");
    expect(r.tariff?.tariffCode).toBe("HAM-NEW");
  });

  it("ne devine pas entre deux produits du même modèle", () => {
    const r = findRenewal(
      { insurerId: 8, tariffCode: "HAM-OLD", tariffLabel: "autre", modelType: "FAMILY_DOCTOR", franchiseChf: 2500, accidentIncluded: false, monthlyPremiumRp: null },
      next,
      params,
      "ADULT",
      new Map(),
    );
    expect(r.confidence).toBe("NONE");
    expect(r.candidates).toHaveLength(2);
  });

  it("utilise le libellé pour départager", () => {
    const r = findRenewal(
      { insurerId: 8, tariffCode: "X", tariffLabel: "Hausarzt plus", modelType: "FAMILY_DOCTOR", franchiseChf: 2500, accidentIncluded: false, monthlyPremiumRp: null },
      next,
      params,
      "ADULT",
      new Map(),
    );
    expect(r.confidence).toBe("PROBABLE");
    expect(r.tariff?.tariffCode).toBe("HAM-2");
  });

  it("ajuste la franchise au passage enfant → jeune adulte", () => {
    const r = findRenewal(
      { insurerId: 8, tariffCode: "BASE", tariffLabel: null, modelType: "STANDARD", franchiseChf: 600, accidentIncluded: false, monthlyPremiumRp: 9000 },
      next,
      params,
      "YOUNG",
      new Map(),
    );
    expect(r.franchiseAdjusted).toBe(true);
    expect(r.targetFranchiseChf).toBe(500);
    expect(r.tariff?.monthlyPremiumRp).toBe(49000);
  });

  it("rattache un contrat saisi à la main via la prime facturée", () => {
    const r = matchPolicyToTariff(
      { insurerId: 8, tariffCode: null, tariffLabel: null, modelType: "FAMILY_DOCTOR", franchiseChf: 2500, accidentIncluded: false, monthlyPremiumRp: 36100 },
      next,
      "ADULT",
    );
    expect(r.confidence).toBe("PROBABLE");
    expect(r.tariff?.tariffCode).toBe("HAM-2");
    const far = matchPolicyToTariff(
      { insurerId: 8, tariffCode: null, tariffLabel: null, modelType: "FAMILY_DOCTOR", franchiseChf: 2500, accidentIncluded: false, monthlyPremiumRp: 20000 },
      next,
      "ADULT",
    );
    expect(far.confidence).toBe("NONE");
  });
});

describe("classement des modèles", () => {
  it.each([
    ["TAR-BASE", "Grundversicherung", "STANDARD"],
    ["TAR-HAM", "Hausarzt", "FAMILY_DOCTOR"],
    ["TAR-HMO", "HMO", "HMO"],
    ["TAR-DIV", "Telmed", "TELMED"],
    ["TAR-DIV", "CallMed", "TELMED"],
    ["TAR-DIV", "Modèle télémédecine", "TELMED"],
    ["TAR-DIV", "Apothekenmodell", "PHARMACY"],
    ["TAR-DIV", "Gesundheitszentrum", "HMO"],
    ["TAR-DIV", "Médecin de famille Plus", "FAMILY_DOCTOR"],
    ["TAR-DIV", "Premium Flex", "OTHER"],
  ] as const)("%s / %s → %s", (type, label, expected) => {
    expect(classifyModel(type, label)).toBe(expected);
  });
});
