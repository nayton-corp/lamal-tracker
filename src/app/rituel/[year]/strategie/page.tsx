import { redirect } from "next/navigation";

/** Ancienne adresse : stratégie et besoins sont réunis dans les préférences. */
export default async function Moved({ params }: { params: Promise<{ year: string }> }) {
  redirect(`/rituel/${(await params).year}/preferences`);
}
