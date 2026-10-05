import { count, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { appUser, household, letter, offerRequest, review, usageCounter } from "@/infrastructure/db/schema";
import { requireAdmin, type Scope } from "./scope";

/*
 * Compteurs internes de l'instance : des totaux, jamais par compte ni par foyer, et rien qui
 * permette de suivre une personne. Les uns sont cumulés (ils survivent aux suppressions), les
 * autres comptés sur les données présentes.
 */

/** Comptes créés ; courriers (demandes et résiliations) marqués envoyés, Pingen compris. */
export type UsageKey = "accounts.created" | "letters.sent";

/** Ajoute n au compteur (dans la transaction de l'action qu'il compte, si possible). */
export function bumpUsage(db: Pick<Db, "insert">, key: UsageKey, n = 1) {
  if (n <= 0) return;
  db.insert(usageCounter)
    .values({ key, value: n })
    .onConflictDoUpdate({ target: usageCounter.key, set: { value: sql`${usageCounter.value} + ${n}` } })
    .run();
}

export interface UsageSummary {
  accountsCreated: number;
  accountsActive: number;
  households: number;
  lettersSent: number;
  years: { year: number; reviews: number; closed: number; letters: number; lettersSent: number }[];
}

/** Statistiques de l'instance pour l'administrateur : compteurs cumulés et totaux par année de bilan. */
export function usageSummary(db: Db, scope: Scope): UsageSummary {
  requireAdmin(scope);
  const counters = new Map(db.select().from(usageCounter).all().map((c) => [c.key, c.value]));
  const n = (q: { n: number } | undefined) => q?.n ?? 0;
  const reviews = db
    .select({ year: review.targetYear, reviews: count(), closed: sql<number>`sum(case when ${review.status} = 'CLOSED' then 1 else 0 end)` })
    .from(review)
    .groupBy(review.targetYear)
    .all();
  const letters = db
    .select({ year: review.targetYear, letters: count(), sent: sql<number>`sum(case when ${letter.sentAt} is not null then 1 else 0 end)` })
    .from(letter)
    .innerJoin(review, eq(review.id, letter.reviewId))
    .groupBy(review.targetYear)
    .all();
  const offers = db.select({ year: review.targetYear, n: count() }).from(offerRequest).innerJoin(review, eq(review.id, offerRequest.reviewId)).groupBy(review.targetYear).all();
  const byYear = new Map(letters.map((l) => [l.year, l]));
  const offersByYear = new Map(offers.map((o) => [o.year, o.n]));
  return {
    accountsCreated: counters.get("accounts.created") ?? 0,
    accountsActive: n(db.select({ n: count() }).from(appUser).where(isNull(appUser.disabledAt)).get()),
    households: n(db.select({ n: count() }).from(household).get()),
    lettersSent: counters.get("letters.sent") ?? 0,
    years: reviews
      .map((r) => ({
        year: r.year,
        reviews: r.reviews,
        closed: Number(r.closed ?? 0),
        letters: (byYear.get(r.year)?.letters ?? 0) + (offersByYear.get(r.year) ?? 0),
        lettersSent: Number(byYear.get(r.year)?.sent ?? 0),
      }))
      .sort((a, b) => b.year - a.year),
  };
}

