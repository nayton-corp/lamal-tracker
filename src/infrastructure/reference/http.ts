// admin.ch refuse les requêtes sans User-Agent de navigateur.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "*/*",
};

export async function fetchBuffer(url: string, timeoutMs = 120_000): Promise<Buffer> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function fetchText(url: string, timeoutMs = 60_000): Promise<string> {
  return (await fetchBuffer(url, timeoutMs)).toString("utf8");
}
