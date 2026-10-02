import { notFound } from "next/navigation";
import { deletePolicyAction } from "@/app/actions";
import { ageClassFor } from "@/domain/age-class";
import { allowedFranchises } from "@/domain/lamal-parameters";
import { app } from "@/server/app";
import { PolicyForm } from "@/ui/forms/policy-forms";
import { Card, Notice, PageHeader } from "@/ui/primitives";

export default async function PolicyPage({ params, searchParams }: PageProps<"/foyer/[personId]/contrat">) {
  const { personId } = await params;
  const sp = await searchParams;
  const ctx = app();
  const person = ctx.household.person(Number(personId));
  if (!person) notFound();
  const year = Number(sp.annee ?? ctx.clock.today().slice(0, 4));
  if (!Number.isInteger(year) || year < 1996 || year > 2100) notFound();
  const existing = ctx.household.policyFor(person.id, year);
  const ageClass = ageClassFor(person.birthDate, Math.max(year, Number(person.birthDate.slice(0, 4))));
  const franchises = allowedFranchises(ctx.reference.parameters(year), ageClass);
  const hasDataset = Boolean(ctx.tariffs.activeDataset(year));
  return (
    <>
      <PageHeader title={`Contrat LAMal ${year}`} subtitle={`${person.firstName} ${person.lastName}`} back={`/foyer/${person.id}`} />
      {!hasDataset && (
        <div className="mb-4">
          <Notice>
            Sans les primes OFSP {year} importées, le contrat est enregistré tel quel. Importe-les ensuite pour le rattacher au tarif officiel.
          </Notice>
        </div>
      )}
      <Card>
        <PolicyForm
          personId={person.id}
          year={year}
          franchises={franchises}
          insurers={ctx.reference.insurers().map((i) => ({ id: i.id, name: i.nameSource === "UNKNOWN" ? `${i.name}` : i.name }))}
          hasDataset={hasDataset}
          values={existing ?? undefined}
        />
      </Card>
      {existing && (
        <form action={deletePolicyAction} className="mt-4 text-center">
          <input type="hidden" name="policyId" value={existing.id} />
          <button type="submit" className="min-h-11 text-sm font-medium text-up hover:underline">
            Supprimer le contrat {year}
          </button>
        </form>
      )}
    </>
  );
}
