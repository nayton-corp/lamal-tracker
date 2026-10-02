/**
 * Recherche et téléchargement des fichiers de primes OFSP sur opendata.swiss (API CKAN).
 * Le jeu de données change de nom et d'URL selon les années : on cherche par mots-clés puis on retient
 * les ressources CSV/ZIP dont le titre ou l'URL mentionne l'année.
 */
export const DEFAULT_SEARCH_URL =
  "https://ckan.opendata.swiss/api/3/action/package_search?rows=50&q=" + encodeURIComponent("prämien krankenversicherung OR primes assurance-maladie");

export interface ResourceCandidate {
  url: string;
  title: string;
  format: string;
  packageTitle: string;
  score: number;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function text(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return [o.fr, o.de, o.en, o.it].filter((x) => typeof x === "string").join(" ");
  }
  return "";
}

export function rankResources(payload: unknown, year: number): ResourceCandidate[] {
  const results = (payload as { result?: { results?: unknown[] } })?.result?.results ?? [];
  const candidates: ResourceCandidate[] = [];
  for (const pkg of results as Record<string, unknown>[]) {
    const packageTitle = text(pkg.title) || String(pkg.name ?? "");
    const pkgText = `${packageTitle} ${text(pkg.description)} ${String(pkg.name ?? "")}`.toLowerCase();
    const pkgRelevant = /pr[äa]e?mie|prime|krankenversicherung|assurance.maladie|premium/.test(pkgText);
    for (const res of (pkg.resources as Record<string, unknown>[] | undefined) ?? []) {
      const url = String(res.download_url ?? res.url ?? "");
      if (!/^https?:\/\//.test(url)) continue;
      const format = String(res.format ?? "").toUpperCase();
      const title = text(res.title) || text(res.name) || url;
      const hay = `${title} ${url} ${text(res.description)}`.toLowerCase();
      if (!/CSV|ZIP/.test(format) && !/\.(csv|zip)(\?|$)/i.test(url)) continue;
      let score = 0;
      if (hay.includes(String(year))) score += 10;
      if (pkgText.includes(String(year))) score += 4;
      if (/pr[äa]e?mie|prime|premium/.test(hay)) score += 3;
      if (pkgRelevant) score += 2;
      if (/region|gemeinde|commune|versicherer|assureur/.test(hay) && !/pr[äa]e?mie|prime/.test(hay)) score -= 5;
      if (score >= 12) candidates.push({ url, title, format: format || (url.toLowerCase().endsWith(".zip") ? "ZIP" : "CSV"), packageTitle, score });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export async function discoverTariffResources(year: number, searchUrl = DEFAULT_SEARCH_URL, fetchImpl: FetchLike = fetch): Promise<ResourceCandidate[]> {
  const res = await fetchImpl(searchUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Recherche opendata.swiss impossible (HTTP ${res.status}).`);
  return rankResources(await res.json(), year);
}

const MAX_BYTES = 300 * 1024 * 1024;

export async function downloadFile(url: string, fetchImpl: FetchLike = fetch): Promise<{ bytes: Uint8Array; fileName: string }> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok) throw new Error(`Téléchargement impossible (HTTP ${res.status}).`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new Error("Fichier trop volumineux.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error("Fichier trop volumineux.");
  const disposition = res.headers.get("content-disposition") ?? "";
  const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
  const fileName = decodeURIComponent(fromHeader ?? new URL(url).pathname.split("/").pop() ?? "primes.csv");
  return { bytes, fileName };
}
