/*
 * Limitation de débit en mémoire, par fenêtre fixe. Suffit pour une seule instance de l'app
 * (un conteneur) ; elle repart à zéro au redémarrage, ce qui est acceptable : le verrouillage
 * par compte, lui, est en base.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const globalForLimits = globalThis as unknown as { __rateLimits?: Map<string, Bucket> };
const buckets = (globalForLimits.__rateLimits ??= new Map());

/** Compte une tentative pour `key` ; false si la limite de la fenêtre est déjà atteinte. */
export function consume(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

/** Oublie les compteurs (tests). */
export function resetRateLimits() {
  buckets.clear();
}
