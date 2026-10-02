import { describe, expect, it } from "vitest";
import { createContext, fixedClock, type AppContext } from "@/application/context";
import { createPerson, savePolicy, saveHousehold } from "@/application/household";
import { activateDataset, importTariffFile } from "@/application/import-tariffs";
import { fetchTariffsFromOpenData, runDailyJobs, type NotificationInput } from "@/application/jobs";
import { chooseOffer, offersForLine, openReview } from "@/application/review";
import { openDatabase } from "@/infrastructure/db/client";
import { memoryFileStore } from "@/infrastructure/files";
import { rankResources } from "@/infrastructure/ofsp/fetcher";
import { fixtureBytes } from "../fixtures/ofsp";

const SEARCH = "https://ckan.example/api/3/action/package_search";

function ckanPayload(year: number) {
  return {
    success: true,
    result: {
      results: [
        {
          name: "regionen-praemien",
          title: { de: "Prämienregionen", fr: "Régions de primes" },
          resources: [{ url: "https://data.example/regionen.csv", format: "CSV", title: { de: "Prämienregionen nach Gemeinde" } }],
        },
        {
          name: `praemien-${year}`,
          title: { de: `Krankenversicherungsprämien ${year}`, fr: `Primes d'assurance-maladie ${year}` },
          resources: [
            { url: `https://data.example/praemien-${year - 1}.zip`, format: "ZIP", title: { de: `Prämien ${year - 1}` } },
            { url: `https://data.example/praemien-${year}.csv`, format: "CSV", title: { de: `Prämien ${year}` } },
          ],
        },
      ],
    },
  };
}

/** Faux réseau : recherche CKAN + fichier de primes synthétique. */
function fakeFetch(year: number, opts: { found?: boolean } = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith(SEARCH)) return Response.json(opts.found === false ? { result: { results: [] } } : ckanPayload(year));
    if (url === `https://data.example/praemien-${year}.csv`) {
      return new Response(new Blob([fixtureBytes({ year, inflation: 1.06 }) as Uint8Array<ArrayBuffer>]), {
        headers: { "content-type": "text/csv" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

function setup(today: string): AppContext {
  const ctx = createContext(openDatabase(":memory:"), fixedClock(today), memoryFileStore());
  ctx.system.saveSetting("datasetSearchUrl", SEARCH);
  return ctx;
}

function seedHousehold(ctx: AppContext) {
  const r = importTariffFile(ctx, { fileName: "praemien_2026.csv", bytes: fixtureBytes({ year: 2026 }), sourceLabel: "test", sourceUrl: null });
  activateDataset(ctx, r.datasetId);
  saveHousehold(ctx, { name: "Foyer", street: "Rue 1", npa: "1000", locality: "Lausanne", canton: "VD", region: 1 });
  const id = createPerson(ctx, { firstName: "Nathan", lastName: "Test", birthDate: "1990-05-01" });
  const t = ctx.tariffs
    .tariffs({ datasetId: r.datasetId, canton: "VD", region: 1, ageClass: "ADULT", accidentIncluded: false, insurerId: 8 })
    .find((x) => x.tariffCode === "BASE" && x.franchiseChf === 2500)!;
  savePolicy(ctx, {
    personId: id,
    coverageYear: 2026,
    insurerId: 8,
    policyNumber: "1",
    modelType: "STANDARD",
    franchiseChf: 2500,
    accidentIncluded: false,
    billedMonthlyRp: t.monthlyPremiumRp,
  });
  return id;
}

describe("recherche opendata.swiss", () => {
  it("retient la ressource de primes de l'année, pas les régions ni l'année précédente", () => {
    const ranked = rankResources(ckanPayload(2027), 2027);
    expect(ranked[0]!.url).toBe("https://data.example/praemien-2027.csv");
    expect(ranked.some((r) => r.url.includes("regionen"))).toBe(false);
  });

  it("importe le fichier trouvé en attente de validation, sans l'activer", async () => {
    const ctx = setup("2026-10-01");
    const outcome = await fetchTariffsFromOpenData(ctx, 2027, fakeFetch(2027));
    expect(outcome.status).toBe("imported");
    const ds = ctx.tariffs.getDataset(outcome.datasetId!)!;
    expect(ds.year).toBe(2027);
    expect(ds.status).toBe("STAGING");
    expect(ds.sourceUrl).toBe("https://data.example/praemien-2027.csv");
    // Second passage : même fichier → doublon
    expect((await fetchTariffsFromOpenData(ctx, 2027, fakeFetch(2027))).status).toBe("duplicate");
  });

  it("signale proprement l'absence de fichier ou une erreur réseau", async () => {
    const ctx = setup("2026-09-20");
    expect((await fetchTariffsFromOpenData(ctx, 2027, fakeFetch(2027, { found: false }))).status).toBe("not-found");
    const failing = (async () => {
      throw new Error("réseau coupé");
    }) as unknown as typeof fetch;
    const r = await fetchTariffsFromOpenData(ctx, 2027, failing);
    expect(r.status).toBe("error");
    expect(r.message).toContain("réseau coupé");
  });
});

describe("tâche quotidienne", () => {
  it("hors saison : ne cherche rien et n'envoie rien", async () => {
    const ctx = setup("2026-06-10");
    let calls = 0;
    const r = await runDailyJobs(ctx, async () => 1, (async () => {
      calls += 1;
      return Response.json({});
    }) as unknown as typeof fetch);
    expect(r.fetch).toBeNull();
    expect(r.notifications).toEqual([]);
    expect(calls).toBe(0);
  });

  it("en saison : télécharge les primes, prévient, puis rappelle la validation sans doublon", async () => {
    const ctx = setup("2026-09-29");
    seedHousehold(ctx);
    const pushed: NotificationInput[] = [];
    const push = async (n: NotificationInput) => {
      pushed.push(n);
      return 1;
    };
    const r1 = await runDailyJobs(ctx, push, fakeFetch(2027));
    expect(r1.fetch?.status).toBe("imported");
    expect(r1.notifications).toEqual(["dataset-imported-2027"]);
    expect(ctx.system.notifications()[0]!.pushedCount).toBe(1);

    // Le lendemain : l'import attend toujours → un rappel « à valider », une seule fois
    const r2 = await runDailyJobs(ctx, push, fakeFetch(2027));
    expect(r2.fetch).toBeNull();
    expect(r2.notifications[0]).toMatch(/^dataset-staging-/);
    expect((await runDailyJobs(ctx, push, fakeFetch(2027))).notifications).toEqual([]);

    // Après activation : le rituel est prêt
    activateDataset(ctx, ctx.tariffs.listDatasets().find((d) => d.year === 2027)!.id);
    expect((await runDailyJobs(ctx, push, fakeFetch(2027))).notifications).toEqual(["review-ready-2027"]);
    expect(pushed).toHaveLength(3);
  });

  it("respecte la désactivation du téléchargement automatique", async () => {
    const ctx = setup("2026-10-01");
    ctx.system.saveSetting("autoFetch", false);
    const r = await runDailyJobs(ctx, async () => 0, fakeFetch(2027));
    expect(r.fetch).toBeNull();
  });

  it("rappels d'échéance : palier atteint, rattrapé si le serveur était éteint, jamais en double", async () => {
    const ctx = setup("2026-10-05");
    seedHousehold(ctx);
    const r = importTariffFile(ctx, {
      fileName: "praemien_2027.csv",
      bytes: fixtureBytes({ year: 2027, inflation: 1.07 }),
      sourceLabel: "t",
      sourceUrl: null,
    });
    activateDataset(ctx, r.datasetId);
    openReview(ctx, 2027);

    // Envoi conseillé le 24.11.2026 : J-30 = 25.10 ; le Pi était éteint ce jour-là, la tâche tourne le 27.10
    const later = createContext(ctx.db, fixedClock("2026-10-27"), memoryFileStore());
    const first = await runDailyJobs(later, async () => 0, fakeFetch(2027, { found: false }));
    expect(first.notifications).toContain("reminder-2027-J30");
    const again = await runDailyJobs(later, async () => 0, fakeFetch(2027, { found: false }));
    expect(again.notifications).not.toContain("reminder-2027-J30");

    // Une fois la décision prise (rester), plus de rappel
    const review = later.reviews.reviewFor(later.household.household()!.id, 2027)!;
    const line = later.reviews.lines(review.id)[0]!;
    const renewal = offersForLine(later, line.id).offers.find((o) => o.tariff.id === line.renewalTariffId)!;
    chooseOffer(later, line.id, renewal.tariff.id);
    const j14 = createContext(ctx.db, fixedClock("2026-11-10"), memoryFileStore());
    expect((await runDailyJobs(j14, async () => 0, fakeFetch(2027, { found: false }))).notifications.filter((k) => k.startsWith("reminder"))).toEqual(
      [],
    );
  });
});
