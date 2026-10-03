// Doublure locale de l'API Pingen v2 (identité, dépôt de fichier, lettres) pour les tests :
// aucune requête ne part vers Pingen, rien n'est posté.
// Lancée seule (e2e) : `node tests/pingen-mock.ts` écoute sur PINGEN_MOCK_PORT (3101).
import { randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

interface MockLetter {
  id: string;
  status: string;
  file_original_name: string;
  tracking_number: string | null;
  price_value: number | null;
  price_currency: string | null;
  attributes: Record<string, unknown>;
  pdf: Buffer;
}

export interface PingenMock {
  url: string;
  state: {
    letters: Map<string, MockLetter>;
    uploads: Map<string, { signature: string; body: Buffer | null }>;
    tokens: number;
    /** Seul jeton accepté ; le changer révoque celui que le client a en cache. */
    token: string;
    /** « drop » : la création est enregistrée mais la connexion est coupée sans réponse ; « reject » : refus 422. */
    failNextCreate: null | "drop" | "reject";
    statusOnRead: string | null;
  };
  close: () => Promise<void>;
}

export const MOCK_CLIENT = { id: "client-test", secret: "secret-test", organisation: "org-test" };

/** `statusOnRead` : statut pris par une lettre à sa première lecture (avancement chez Pingen). */
export function startPingenMock(options: { port?: number; statusOnRead?: string | null } = {}): Promise<PingenMock> {
  const state: PingenMock["state"] = {
    letters: new Map(),
    uploads: new Map(),
    tokens: 0,
    token: "jeton-test",
    failNextCreate: null,
    statusOnRead: options.statusOnRead ?? null,
  };
  let base = "";

  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/vnd.api+json" });
    res.end(JSON.stringify(body));
  };
  const letterJson = (l: MockLetter) => ({
    id: l.id,
    type: "letters",
    attributes: { status: l.status, file_original_name: l.file_original_name, tracking_number: l.tracking_number, price_value: l.price_value, price_currency: l.price_currency },
  });

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? "/", base);
    const authed = req.headers.authorization === `Bearer ${state.token}`;

    if (url.pathname === "/health") return json(res, 200, { ok: true });
    if (req.method === "POST" && url.pathname === "/auth/access-tokens") {
      const form = new URLSearchParams(body.toString());
      if (form.get("grant_type") !== "client_credentials" || form.get("client_id") !== MOCK_CLIENT.id || form.get("client_secret") !== MOCK_CLIENT.secret) {
        return json(res, 401, { error: "invalid_client" });
      }
      state.tokens++;
      return json(res, 200, { token_type: "Bearer", access_token: state.token, expires_in: 43200 });
    }
    if (req.method === "PUT" && url.pathname.startsWith("/upload/")) {
      const up = state.uploads.get(url.pathname);
      if (!up) return json(res, 404, {});
      up.body = body;
      res.writeHead(200).end();
      return;
    }
    if (!authed) return json(res, 401, { errors: [{ title: "Unauthenticated" }] });

    if (req.method === "GET" && url.pathname === "/file-upload") {
      const path = `/upload/${randomUUID()}`;
      const signature = randomUUID();
      state.uploads.set(path, { signature, body: null });
      return json(res, 200, { data: { id: path, type: "file_uploads", attributes: { url: base + path, url_signature: signature, expires_at: new Date(Date.now() + 3600_000).toISOString() } } });
    }
    const letters = `/organisations/${MOCK_CLIENT.organisation}/deliveries/letters`;
    if (req.method === "POST" && url.pathname === letters) {
      const attrs = (JSON.parse(body.toString()) as { data?: { attributes?: Record<string, unknown> } }).data?.attributes ?? {};
      const up = state.uploads.get(new URL(String(attrs.file_url), base).pathname);
      if (!up || up.signature !== attrs.file_url_signature || !up.body) return json(res, 422, { errors: [{ detail: "file_url invalide" }] });
      if (up.body.subarray(0, 5).toString("latin1") !== "%PDF-") return json(res, 422, { errors: [{ detail: "PDF illisible" }] });
      if (state.failNextCreate === "reject") {
        state.failNextCreate = null;
        return json(res, 422, { errors: [{ detail: "delivery_product indisponible" }] });
      }
      const l: MockLetter = { id: randomUUID(), status: "validating", file_original_name: String(attrs.file_original_name), tracking_number: null, price_value: null, price_currency: null, attributes: attrs, pdf: up.body };
      state.letters.set(l.id, l);
      if (state.failNextCreate === "drop") {
        state.failNextCreate = null;
        req.socket.destroy();
        return;
      }
      return json(res, 201, { data: letterJson(l) });
    }
    if (req.method === "GET" && url.pathname === letters) {
      return json(res, 200, { data: [...state.letters.values()].reverse().map(letterJson) });
    }
    if (req.method === "GET" && url.pathname.startsWith(`${letters}/`)) {
      const l = state.letters.get(url.pathname.slice(letters.length + 1));
      if (!l) return json(res, 404, { errors: [{ title: "Not found" }] });
      if (state.statusOnRead && l.status === "validating") l.status = state.statusOnRead;
      return json(res, 200, { data: letterJson(l) });
    }
    return json(res, 404, { errors: [{ title: "Not found" }] });
  });

  return new Promise((resolve) => {
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : options.port}`;
      resolve({ url: base, state, close: () => new Promise<void>((r) => server.close(() => r())) });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mock = await startPingenMock({ port: Number(process.env.PINGEN_MOCK_PORT ?? 3101), statusOnRead: process.env.PINGEN_MOCK_STATUS ?? "action_required" });
  console.log(`[pingen-mock] ${mock.url}`);
}
