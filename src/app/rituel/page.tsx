import { redirect } from "next/navigation";
import { activeReview } from "@/application/review";
import { db, ritualYear } from "@/server/context";

export const dynamic = "force-dynamic";

/** Le rituel en cours (même après le changement d'année civile), sinon celui de l'année cible. */
export default function RitualIndex() {
  redirect(`/rituel/${activeReview(db())?.targetYear ?? ritualYear()}`);
}
