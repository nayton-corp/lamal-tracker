import { createHash } from "node:crypto";

/*
 * Mots de passe connus des fuites (Have I Been Pwned), par k-anonymat : seuls les 5 premiers
 * caractères de l'empreinte SHA-1 quittent le serveur, jamais le mot de passe.
 * HIBP_DISABLED=true coupe la vérification (tests, serveur sans accès à Internet).
 */

const API = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 3000;

/** Nombre d'apparitions dans les fuites ; null si le service n'a pas répondu (on n'empêche rien). */
export async function pwnedCount(password: string, fetchFn: typeof fetch = fetch, env: Record<string, string | undefined> = process.env): Promise<number | null> {
  if (env.HIBP_DISABLED === "true") return null;
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchFn(API + prefix, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    for (const line of (await res.text()).split("\n")) {
      const [hash, count] = line.trim().split(":");
      if (hash === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}
