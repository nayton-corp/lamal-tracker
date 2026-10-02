import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Sources OFSP. Depuis les primes 2027, le fichier n'est plus sur priminfo.admin.ch mais
 * sur opendata.swiss (hébergé par opendata.bagnet.ch). On demande d'abord l'URL courante
 * à l'API CKAN d'opendata.swiss, avec repli sur l'URL connue.
 */
export const CKAN_PACKAGE_URL =
  "https://opendata.swiss/api/3/action/package_show?id=health-insurance-premiums";

/** « /Praemien/Prämien_CH.xlsx » encodé en base64 dans le paramètre path. */
export const FALLBACK_PREMIUMS_URL =
  "https://opendata.bagnet.ch/?r=/download&path=L1ByYWVtaWVuL1Byw6RtaWVuX0NILnhsc3g%3D";

// admin.ch et bagnet refusent les requêtes sans User-Agent de navigateur.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "*/*",
};

interface CkanResource {
  url?: string;
  format?: string;
  name?: string | Record<string, string>;
  title?: string | Record<string, string>;
  download_url?: string;
}

function label(v: CkanResource["name"]): string {
  if (!v) return "";
  return typeof v === "string" ? v : Object.values(v).join(" ");
}

function decodedPath(url: string): string {
  try {
    const p = new URL(url).searchParams.get("path");
    return p ? Buffer.from(p, "base64").toString("utf8") : "";
  } catch {
    return "";
  }
}

/** Choisit la ressource « primes Suisse » dans la réponse CKAN (xlsx de préférence). */
export function pickPremiumResource(payload: unknown): string | null {
  const resources: CkanResource[] =
    (payload as { result?: { resources?: CkanResource[] } })?.result?.resources ?? [];
  const scored = resources
    .map((r) => {
      const url = r.download_url || r.url || "";
      const text = `${label(r.name)} ${label(r.title)} ${url} ${decodedPath(url)}`;
      const isPremiumCh = /pr(ä|ae|a)mien[_ ]?ch/i.test(text) || /primes?[_ ]?ch/i.test(text);
      const format = (r.format ?? "").toLowerCase();
      const score = (isPremiumCh ? 10 : 0) + (format.includes("xlsx") || /\.xlsx/i.test(text) ? 2 : format.includes("csv") ? 1 : 0);
      return { url, score };
    })
    .filter((r) => r.url && r.score >= 10)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url ?? null;
}

export async function resolvePremiumsUrl(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (process.env.OFSP_PREMIUMS_URL) return process.env.OFSP_PREMIUMS_URL;
  try {
    const res = await fetchImpl(CKAN_PACKAGE_URL, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
    if (res.ok) {
      const url = pickPremiumResource(await res.json());
      if (url) return url;
    }
  } catch {
    // réseau indisponible : repli
  }
  return FALLBACK_PREMIUMS_URL;
}

export interface RemoteSignature {
  url: string;
  etag: string | null;
  lastModified: string | null;
  length: string | null;
}

/** Signature HTTP du fichier distant, pour détecter une nouvelle publication sans le télécharger. */
export async function remoteSignature(url: string): Promise<RemoteSignature> {
  const res = await fetch(url, { method: "HEAD", headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HEAD ${url} : HTTP ${res.status}`);
  return {
    url,
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
    length: res.headers.get("content-length"),
  };
}

export async function download(url: string, dir: string): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Téléchargement ${url} : HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  const ext = /csv/i.test(type) ? ".csv" : ".xlsx";
  const target = path.join(dir, `primes-${new Date().toISOString().replace(/[:.]/g, "-")}${ext}`);
  const partial = `${target}.part`;
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(partial));
  fs.renameSync(partial, target);
  return target;
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}
