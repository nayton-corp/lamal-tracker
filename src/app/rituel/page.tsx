import { redirect } from "next/navigation";
import { activeReview } from "@/application/review";
import { db, reviewTargetYear } from "@/server/context";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";

/** Le rituel en cours (même après le changement d'année civile), sinon celui de l'année cible. */
export default async function RitualIndex() {
  const scope = await pageScope();
  redirect(`/rituel/${activeReview(db(), scope)?.targetYear ?? reviewTargetYear()}`);
}
