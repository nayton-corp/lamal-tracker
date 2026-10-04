import { redirect } from "next/navigation";
import { getHousehold, listInsurers, listPersons } from "@/application/household";
import { insurerLabel } from "@/infrastructure/db/queries";
import { db, today } from "@/server/context";
import { Page, PageHeader } from "@/ui/page";
import { ImportFlow } from "./import-flow";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importer une police" };

export default async function ImportPolicyPage() {
  const scope = await pageScope();
  const h = getHousehold(db(), scope);
  if (!h) redirect("/bienvenue");
  const persons = listPersons(db(), h.id);
  const year = Number(today().slice(0, 4));
  return (
    <Page>
      <PageHeader title="Importer une police" subtitle="Le PDF de la police : tout est rempli, vous vérifiez." back="/foyer" />
      <ImportFlow
        hasPersons={persons.length > 0}
        insurers={listInsurers(db()).map((i) => ({ id: i.id, name: insurerLabel(i) })).sort((a, b) => a.name.localeCompare(b.name, "fr"))}
        years={Array.from({ length: year + 2 - 2010 }, (_, i) => year + 1 - i)}
      />
    </Page>
  );
}
