/**
 * Client minimal de l'API Pingen v2 (https://api.pingen.com/documentation) : impression et envoi
 * d'une lettre en recommandé par la Poste suisse.
 *
 * Authentification OAuth « client_credentials » ; dépôt du PDF sur l'URL signée fournie par
 * /file-upload, puis création de la lettre avec envoi automatique dès qu'elle est validée.
 */

export interface PingenConfig {
  clientId: string;
  clientSecret: string;
  organisationId: string;
  apiUrl: string;
  identityUrl: string;
  staging: boolean;
}

export interface PingenLetter {
  id: string;
  status: string;
  fileName: string | null;
  trackingNumber: string | null;
  /** Prix facturé, en centimes (seulement en CHF). */
  priceRp: number | null;
}

export interface PingenClient {
  readonly staging: boolean;
  /** Dépose le PDF et demande l'envoi en recommandé. */
  sendRegistered(pdf: Uint8Array, fileName: string): Promise<PingenLetter>;
  getLetter(id: string): Promise<PingenLetter>;
  /** Retrouve une lettre par le nom de fichier transmis (création restée sans réponse). */
  findByFileName(fileName: string): Promise<PingenLetter | null>;
}

/** Pingen a répondu par un refus : rien n'a été envoyé, on peut corriger et réessayer. */
export class PingenError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PingenError";
  }
}

/**
 * La demande d'envoi est partie sans réponse exploitable (coupure, délai, erreur 5xx) :
 * Pingen a peut-être créé la lettre. Ne jamais renvoyer à l'aveugle.
 */
export class PingenNoAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PingenNoAnswerError";
  }
}

/**
 * Configuration lue dans l'environnement ; null si l'envoi par Pingen n'est pas configuré
 * (l'option n'apparaît alors pas dans l'interface).
 */
export function pingenConfig(env: Record<string, string | undefined> = process.env): PingenConfig | null {
  const clientId = env.PINGEN_CLIENT_ID?.trim();
  const clientSecret = env.PINGEN_CLIENT_SECRET?.trim();
  const organisationId = env.PINGEN_ORGANISATION_ID?.trim();
  if (!clientId || !clientSecret || !organisationId) return null;
  const staging = env.PINGEN_STAGING === "true";
  const strip = (u: string) => u.replace(/\/+$/, "");
  return {
    clientId,
    clientSecret,
    organisationId,
    staging,
    apiUrl: strip(env.PINGEN_API_URL?.trim() || (staging ? "https://api-staging.pingen.com" : "https://api.pingen.com")),
    identityUrl: strip(env.PINGEN_IDENTITY_URL?.trim() || (staging ? "https://identity-staging.pingen.com" : "https://identity.pingen.com")),
  };
}

const TIMEOUT_MS = 30_000;
const JSON_API = "application/vnd.api+json";

type Fetch = typeof fetch;

interface JsonApiLetter {
  id?: unknown;
  attributes?: { status?: unknown; file_original_name?: unknown; tracking_number?: unknown; price_value?: unknown; price_currency?: unknown };
}

function toLetter(data: JsonApiLetter | undefined): PingenLetter {
  const id = typeof data?.id === "string" ? data.id : null;
  const attributes = data?.attributes ?? {};
  if (!id || typeof attributes.status !== "string") throw new PingenError("Réponse de Pingen illisible (lettre sans identifiant ni statut).");
  const price = attributes.price_value === null || attributes.price_value === undefined ? NaN : Number(attributes.price_value);
  return {
    id,
    status: attributes.status,
    fileName: typeof attributes.file_original_name === "string" ? attributes.file_original_name : null,
    trackingNumber: typeof attributes.tracking_number === "string" && attributes.tracking_number.trim() ? attributes.tracking_number.trim() : null,
    // Frontière de l'API : Pingen donne un prix décimal, converti une fois en centimes entiers.
    priceRp: Number.isFinite(price) && attributes.price_currency === "CHF" ? Math.round(price * 100) : null,
  };
}

/** Premier message d'erreur JSON:API lisible, sinon un extrait du corps. */
async function errorDetail(r: Response): Promise<string> {
  const text = await r.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { errors?: { title?: string; detail?: string; code?: string }[]; error_description?: string; message?: string };
    const firstError = json.errors?.[0];
    const detail = firstError?.detail || firstError?.title || firstError?.code || json.error_description || json.message;
    if (detail) return String(detail).slice(0, 300);
  } catch {
    // corps non JSON
  }
  return text.slice(0, 200) || `HTTP ${r.status}`;
}

const tokens = new Map<string, { token: string; expiresAt: number }>();

/** Client Pingen ; le jeton OAuth est gardé en mémoire et renouvelé une minute avant son expiration. */
export function createPingenClient(config: PingenConfig, fetchImpl: Fetch = fetch): PingenClient {
  const cacheKey = `${config.identityUrl}|${config.clientId}`;

  async function call(url: string, init: RequestInit): Promise<Response> {
    return fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  }

  async function accessToken(): Promise<string> {
    const cached = tokens.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
    let response: Response;
    try {
      response = await call(`${config.identityUrl}/auth/access-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret }),
      });
    } catch {
      throw new PingenError("Pingen injoignable : vérifiez la connexion du serveur.");
    }
    if (!response.ok) throw new PingenError(`Connexion à Pingen refusée (${response.status}) : vérifiez PINGEN_CLIENT_ID et PINGEN_CLIENT_SECRET.`, response.status);
    const json = (await response.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown };
    if (typeof json.access_token !== "string" || !json.access_token) throw new PingenError("Pingen n'a pas fourni de jeton d'accès.");
    tokens.set(cacheKey, { token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 });
    return json.access_token;
  }

  /** Appel authentifié ; un jeton expiré (401) est renouvelé une fois. */
  async function api(method: string, path: string, body?: unknown, retry = true): Promise<Response> {
    const token = await accessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: JSON_API };
    if (body !== undefined) headers["Content-Type"] = JSON_API;
    const response = await call(`${config.apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 401 && retry) {
      tokens.delete(cacheKey);
      return api(method, path, body, false);
    }
    return response;
  }

  async function readJson<T>(r: Response, what: string): Promise<T> {
    if (!r.ok) throw new PingenError(`Pingen : ${what} refusé (${r.status}) — ${await errorDetail(r)}`, r.status);
    return (await r.json()) as T;
  }

  const letters = `/organisations/${encodeURIComponent(config.organisationId)}/deliveries/letters`;

  return {
    staging: config.staging,

    async sendRegistered(pdf, fileName) {
      // Étapes préalables : un échec ici n'envoie rien, on peut réessayer sans risque.
      let upload: { data?: { attributes?: { url?: unknown; url_signature?: unknown } } };
      try {
        upload = await readJson(await api("GET", "/file-upload"), "dépôt du fichier");
      } catch (firstError) {
        if (firstError instanceof PingenError) throw firstError;
        throw new PingenError("Pingen injoignable : vérifiez la connexion du serveur.");
      }
      const url = upload.data?.attributes?.url;
      const signature = upload.data?.attributes?.url_signature;
      if (typeof url !== "string" || typeof signature !== "string") throw new PingenError("Pingen n'a pas fourni d'adresse de dépôt pour le PDF.");
      let put: Response;
      try {
        put = await call(url, { method: "PUT", body: new Uint8Array(pdf) });
      } catch {
        throw new PingenError("Le dépôt du PDF chez Pingen a échoué : réessayez.");
      }
      if (!put.ok) throw new PingenError(`Le dépôt du PDF chez Pingen a échoué (${put.status}) : réessayez.`, put.status);

      const payload = {
        data: {
          type: "letters",
          attributes: {
            file_original_name: fileName,
            file_url: url,
            file_url_signature: signature,
            address_position: "right",
            auto_send: true,
            delivery_product: "registered",
            print_mode: "simplex",
            print_spectrum: "grayscale",
          },
        },
      };
      let response: Response;
      try {
        response = await api("POST", letters, payload);
      } catch (e) {
        if (e instanceof PingenError) throw e;
        throw new PingenNoAnswerError("Pingen n'a pas répondu à la demande d'envoi : la lettre est peut-être partie.");
      }
      if (response.status >= 500) throw new PingenNoAnswerError(`Pingen a répondu par une erreur ${response.status} : la lettre est peut-être partie.`);
      const created = await readJson<{ data?: JsonApiLetter }>(response, "envoi de la lettre");
      return toLetter(created.data);
    },

    async getLetter(id) {
      const response = await api("GET", `${letters}/${encodeURIComponent(id)}`);
      return toLetter((await readJson<{ data?: JsonApiLetter }>(response, "lecture de la lettre")).data);
    },

    async findByFileName(fileName) {
      const response = await api("GET", letters);
      const list = await readJson<{ data?: JsonApiLetter[] }>(response, "liste des lettres");
      const hit = (list.data ?? []).find((d) => d.attributes?.file_original_name === fileName);
      return hit ? toLetter(hit) : null;
    },
  };
}
