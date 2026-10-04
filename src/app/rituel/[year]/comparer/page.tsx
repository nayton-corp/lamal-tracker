import { redirect } from "next/navigation";
import { getReviewByYear, reviewMembers } from "@/application/review";
import { db } from "@/server/context";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";

/** Écran de comparaison : s'ouvre sur la première personne sans choix (onglets pour les autres). */
export default async function CompareEntry({ params }: { params: Promise<{ year: string }> }) {
  const scope = await pageScope();
  const year = Number((await params).year);
  const r = getReviewByYear(db(), scope, year);
  if (!r) redirect(`/rituel/${year}`);
  const lines = reviewMembers(db(), scope, r.id);
  const target = lines.find((l) => l.decision === "UNDECIDED") ?? lines[0];
  redirect(target ? `/rituel/${year}/personne/${target.id}` : `/rituel/${year}`);
}
