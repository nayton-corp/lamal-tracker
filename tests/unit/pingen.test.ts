import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { abandonPingen, pingenFileName, sendLetterViaPingen, syncPingenLetters, type PingenDeps } from "@/application/pingen";
import { getLetter } from "@/application/letters";
import { UserError } from "@/application/errors";
import { saveSignature } from "@/application/signatures";
import { buildLetter } from "@/domain/letter";
import { PINGEN_UNKNOWN } from "@/domain/pingen";
import { openDb, type Db } from "@/infrastructure/db/client";
import { insurer, letter, person, review, tariffDataset } from "@/infrastructure/db/schema";
import { createPingenClient, pingenConfig, type PingenClient } from "@/infrastructure/pingen/client";
import { renderLetterPdf } from "@/infrastructure/pdf/letter-pdf";
import { MOCK_CLIENT, startPingenMock, type PingenMock } from "../pingen-mock";
import { testHousehold } from "../accounts";
import type { Scope } from "@/application/scope";

const TODAY = "2026-10-05";
const NOW = "2026-10-05T08:00:00.000Z";
// Plus petit PNG valide (1 × 1 px) : la signature apposée par le rendu PDF.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let mock: PingenMock;
let db: Db;
let client: PingenClient;
let deps: PingenDeps;
let alexId: number;
let letterId: number;
let scope: Scope;
let insurerId: number;

function newLetter(): number {
  const content = buildLetter({
    kind: "TERMINATION",
    senderLines: ["Alex Test", "Rue du Test 1", "1000 Lausanne"],
    insurerLines: ["Helsana Assurances SA", "Case postale", "8081 Zurich"],
    place: "Lausanne",
    date: TODAY,
    effectiveEnd: "2026-12-31",
    targetYear: 2027,
    persons: [{ fullName: "Alex Test", birthDate: "1990-04-02", policyNumber: "HEL-123", isMinor: false }],
  });
  return db.insert(letter).values({ reviewId: 1, insurerId, kind: "TERMINATION", lineIds: [], content }).returning().get().id;
}

beforeAll(async () => {
  mock = await startPingenMock();
  const config = pingenConfig({ PINGEN_CLIENT_ID: MOCK_CLIENT.id, PINGEN_CLIENT_SECRET: MOCK_CLIENT.secret, PINGEN_ORGANISATION_ID: MOCK_CLIENT.organisation, PINGEN_API_URL: mock.url, PINGEN_IDENTITY_URL: mock.url, PINGEN_STAGING: "true" })!;
  client = createPingenClient(config);
  deps = { client, render: (content, signed) => renderLetterPdf(content, signed, "pingen") };
  db = openDb(":memory:");
  scope = testHousehold(db);
  const h = { id: scope.householdId! };
  alexId = db.insert(person).values({ householdId: h.id, firstName: "Alex", lastName: "Test", birthDate: "1990-04-02" }).returning().get().id;
  insurerId = db.select().from(insurer).get()!.id;
  const ds = db.insert(tariffDataset).values({ year: 2027, source: "test", fileSha256: "x", status: "ACTIVE" }).returning().get();
  db.insert(review).values({ householdId: h.id, targetYear: 2027, datasetId: ds.id, status: "DECIDED" }).run();
});

afterAll(() => mock.close());

beforeEach(() => {
  mock.state.statusOnRead = null;
  mock.state.failNextCreate = null;
  letterId = newLetter();
});

describe("configuration", () => {
  it("masque l'option sans les trois variables, et choisit l'environnement", () => {
    expect(pingenConfig({ PINGEN_CLIENT_ID: "a", PINGEN_CLIENT_SECRET: "b" })).toBeNull();
    expect(pingenConfig({ PINGEN_CLIENT_ID: "a", PINGEN_CLIENT_SECRET: "b", PINGEN_ORGANISATION_ID: "c" })).toMatchObject({
      staging: false,
      apiUrl: "https://api.pingen.com",
      identityUrl: "https://identity.pingen.com",
    });
    expect(pingenConfig({ PINGEN_CLIENT_ID: "a", PINGEN_CLIENT_SECRET: "b", PINGEN_ORGANISATION_ID: "c", PINGEN_STAGING: "true" })).toMatchObject({
      staging: true,
      apiUrl: "https://api-staging.pingen.com",
    });
  });
});

describe("envoi par Pingen", () => {
  it("refuse tant que le signataire n'a pas signé à l'écran", async () => {
    await expect(sendLetterViaPingen(db, scope, letterId, TODAY, NOW, deps)).rejects.toThrow(/Signature à l'écran manquante : Alex Test/);
    expect(getLetter(db, scope, letterId)!.sentAt).toBeNull();
    saveSignature(db, scope, alexId, PNG);
  });

  it("dépose le PDF et demande le recommandé, adresse à droite ; puis suit l'envoi", async () => {
    const sent = await sendLetterViaPingen(db, scope, letterId, TODAY, NOW, deps);
    expect(sent.status).toBe("validating");
    const remote = mock.state.letters.get(sent.id)!;
    expect(remote.attributes).toMatchObject({ delivery_product: "registered", address_position: "right", auto_send: true, print_spectrum: "grayscale" });
    expect(remote.file_original_name).toBe(pingenFileName(getLetter(db, scope, letterId)!));
    expect(remote.pdf.subarray(0, 5).toString()).toBe("%PDF-");

    const row = getLetter(db, scope, letterId)!;
    expect(row).toMatchObject({ sentAt: TODAY, pingenLetterId: sent.id, pingenStatus: "validating" });
    // Une seconde demande n'envoie pas la lettre deux fois.
    await expect(sendLetterViaPingen(db, scope, letterId, TODAY, NOW, deps)).rejects.toThrow(/déjà envoyée/);

    // Pingen la remet à la Poste : n° de suivi et prix remontent.
    Object.assign(remote, { status: "sent", tracking_number: "98.34.123456.12345678", price_value: 5.8, price_currency: "CHF" });
    const sync = await syncPingenLetters(db, client, NOW);
    expect(sync.errors).toEqual([]);
    expect(getLetter(db, scope, letterId)).toMatchObject({ pingenStatus: "sent", trackingNumber: "98.34.123456.12345678", pingenPriceRp: 580 });
    // Distribuée : plus suivie, et ne peut plus être reprise.
    remote.status = "delivered";
    await syncPingenLetters(db, client, NOW);
    expect((await syncPingenLetters(db, client, NOW, letterId)).checked).toBe(0);
    expect(() => abandonPingen(db, scope, letterId)).toThrow(UserError);
  });

  it("un refus de Pingen laisse la lettre à envoyer", async () => {
    mock.state.failNextCreate = "reject";
    await expect(sendLetterViaPingen(db, scope, letterId, TODAY, NOW, deps)).rejects.toThrow(/delivery_product indisponible/);
    expect(getLetter(db, scope, letterId)).toMatchObject({ sentAt: null, pingenStatus: null });
  });

  it("une lettre refusée après coup se signale, puis se reprend", async () => {
    mock.state.statusOnRead = "action_required";
    await sendLetterViaPingen(db, scope, letterId, TODAY, NOW, deps);
    const sync = await syncPingenLetters(db, client, NOW);
    expect(sync.newlyFailed).toEqual([letterId]);
    // Déjà signalée : pas de second avertissement.
    expect((await syncPingenLetters(db, client, NOW)).newlyFailed).toEqual([]);
    abandonPingen(db, scope, letterId);
    expect(getLetter(db, scope, letterId)).toMatchObject({ sentAt: null, trackingNumber: null, pingenLetterId: null, pingenStatus: null });
  });

  it("sans réponse, la lettre reste « non confirmée » puis est retrouvée par son nom de fichier", async () => {
    mock.state.failNextCreate = "drop";
    await expect(sendLetterViaPingen(db, scope, letterId, TODAY, NOW, deps)).rejects.toThrow(/peut-être partie/);
    expect(getLetter(db, scope, letterId)).toMatchObject({ sentAt: TODAY, pingenStatus: PINGEN_UNKNOWN, pingenLetterId: null });
    await expect(sendLetterViaPingen(db, scope, letterId, TODAY, NOW, deps)).rejects.toThrow(/déjà envoyée/);
    await syncPingenLetters(db, client, NOW);
    const row = getLetter(db, scope, letterId)!;
    expect(row.pingenStatus).toBe("validating");
    expect(mock.state.letters.get(row.pingenLetterId!)).toBeDefined();
  });

  it("renouvelle un jeton révoqué", async () => {
    const id = [...mock.state.letters.keys()][0]!;
    const before = mock.state.tokens;
    mock.state.token = "jeton-renouvele";
    await expect(client.getLetter(id)).resolves.toMatchObject({ id });
    expect(mock.state.tokens).toBe(before + 1);
  });
});
