import { redirect } from "next/navigation";
import { getHousehold, listInsurers, listPersons } from "@/application/household";
import { insurerLabel } from "@/domain/insurer";
import { currentYear, db } from "@/server/context";
import { Page, PageHeader } from "@/ui/page";
import { ImportFlow } from "./import-flow";
import { pageScope } from "@/server/auth";
import { selectableYears } from "@/domain/lamal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importer une police" };

/** Ouvert depuis « Ajouter un contrat » d'une personne (`?personne=12`) : elle est retenue d'office. */
export default async function ImportPolicyPage({ searchParams }: { searchParams: Promise<{ personne?: string }> }) {
  const scope = await pageScope();
  const householdRow = getHousehold(db(), scope);
  if (!householdRow) redirect("/bienvenue");
  const persons = listPersons(db(), householdRow.id);
  const { personne } = await searchParams;
  const focus = persons.find((p) => String(p.id) === personne) ?? null;
  const back = focus ? `/foyer/personne/${focus.id}` : "/foyer";
  const year = currentYear();
  return (
    <Page>
      <PageHeader title="Importer une police" subtitle="Le PDF de la police : tout est rempli, vous vérifiez." back={back} />
      <ImportFlow
        hasPersons={persons.length > 0}
        focus={focus ? { personId: focus.id, firstName: focus.firstName } : undefined}
        backHref={back}
        insurers={listInsurers(db()).map((i) => ({ id: i.id, name: insurerLabel(i) })).sort((a, b) => a.name.localeCompare(b.name, "fr"))}
        years={selectableYears(year)}
      />
    </Page>
  );
}
