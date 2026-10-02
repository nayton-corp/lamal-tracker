import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getReviewByYear } from "@/application/review";
import { reviewLine } from "@/infrastructure/db/schema";
import { db } from "@/server/context";

export const dynamic = "force-dynamic";

/** Écran de comparaison : s'ouvre sur la première personne sans choix (onglets pour les autres). */
export default async function CompareEntry({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  const r = getReviewByYear(db(), year);
  if (!r) redirect(`/rituel/${year}`);
  const lines = db().select().from(reviewLine).where(eq(reviewLine.reviewId, r.id)).orderBy(asc(reviewLine.id)).all();
  const target = lines.find((l) => l.decision === "UNDECIDED") ?? lines[0];
  redirect(target ? `/rituel/${year}/personne/${target.id}` : `/rituel/${year}`);
}
