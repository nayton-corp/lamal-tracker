import { redirect } from "next/navigation";
import { getHousehold, listInsurers, listPersons } from "@/application/household";
import { insurerLabel } from "@/infrastructure/db/queries";
import { currentYear, db } from "@/server/context";
import { Page, PageHeader } from "@/ui/page";
import { ImportFlow } from "./import-flow";
import { pageScope } from "@/server/auth";
import { selectableYears } from "@/domain/lamal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importer une police" };

export default async function ImportPolicyPage() {
  const scope = await pageScope();
  const householdRow = getHousehold(db(), scope);
  if (!householdRow) redirect("/bienvenue");
  const persons = listPersons(db(), householdRow.id);
  const year = currentYear();
  return (
    <Page>
      <PageHeader title="Importer une police" subtitle="Le PDF de la police : tout est rempli, vous vérifiez." back="/foyer" />
      <ImportFlow
        hasPersons={persons.length > 0}
        insurers={listInsurers(db()).map((i) => ({ id: i.id, name: insurerLabel(i) })).sort((a, b) => a.name.localeCompare(b.name, "fr"))}
        years={selectableYears(year)}
      />
    </Page>
  );
}
