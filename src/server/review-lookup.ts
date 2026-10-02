import "server-only";
import { notFound } from "next/navigation";
import { app } from "./app";

/** Rituel du foyer pour une année d'URL, ou 404. */
export function reviewForYear(yearParam: string) {
  const ctx = app();
  const year = Number(yearParam);
  const h = ctx.household.household();
  if (!h || !Number.isInteger(year)) notFound();
  const review = ctx.reviews.reviewFor(h.id, year);
  if (!review) notFound();
  return { ctx, review, household: h, year };
}
