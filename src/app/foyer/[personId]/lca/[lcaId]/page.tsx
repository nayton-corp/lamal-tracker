import { notFound } from "next/navigation";
import { deleteLcaAction } from "@/app/actions";
import { app } from "@/server/app";
import { LcaForm } from "@/ui/forms/policy-forms";
import { Card, Notice, PageHeader } from "@/ui/primitives";

export default async function LcaPage({ params }: PageProps<"/foyer/[personId]/lca/[lcaId]">) {
  const { personId, lcaId } = await params;
  const ctx = app();
  const person = ctx.household.person(Number(personId));
  if (!person) notFound();
  const isNew = lcaId === "nouvelle";
  const lca = isNew ? undefined : ctx.household.lcaPolicy(Number(lcaId));
  if (!isNew && (!lca || lca.personId !== person.id)) notFound();
  const premiums = lca ? ctx.household.lcaPremiums(lca.id) : [];
  return (
    <>
      <PageHeader title={isNew ? "Nouvelle complémentaire" : lca!.productName} subtitle={`${person.firstName} · assurance complémentaire (LCA)`} back={`/foyer/${person.id}`} />
      <div className="mb-4">
        <Notice tone="lca" title="LCA ≠ LAMal">
          Une complémentaire est un contrat privé séparé. Changer de caisse LAMal ne la résilie pas, et il ne faut jamais la résilier avant
          d&apos;avoir été accepté ailleurs après un questionnaire de santé.
        </Notice>
      </div>
      <Card>
        <LcaForm
          personId={person.id}
          insurers={ctx.reference.insurers().map((i) => ({ id: i.id, name: i.name }))}
          values={lca ? { ...lca, monthlyPremiumRp: premiums.at(-1)?.monthlyRp ?? null } : undefined}
        />
      </Card>
      {lca && (
        <form action={deleteLcaAction} className="mt-4 text-center">
          <input type="hidden" name="id" value={lca.id} />
          <input type="hidden" name="personId" value={person.id} />
          <button type="submit" className="min-h-11 text-sm font-medium text-up hover:underline">
            Supprimer cette complémentaire de l&apos;application
          </button>
        </form>
      )}
    </>
  );
}
