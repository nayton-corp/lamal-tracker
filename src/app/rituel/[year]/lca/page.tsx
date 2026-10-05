import { redirect } from "next/navigation";

/** Ancienne étape « Vérifier les complémentaires » : le rappel est désormais dans les démarches. */
export default async function LcaPage({ params }: { params: Promise<{ year: string }> }) {
  redirect(`/rituel/${(await params).year}/lettres`);
}
