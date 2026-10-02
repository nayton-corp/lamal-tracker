import { redirect } from "next/navigation";
import { getHousehold, listInsurers, listPersons } from "@/application/household";
import { insurerLabel } from "@/infrastructure/db/queries";
import { db, today } from "@/server/context";
import { Page, PageHeader } from "@/ui/page";
import { ImportFlow } from "./import-flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importer une police" };

export default function ImportPolicyPage() {
  const h = getHousehold(db());
  if (!h) redirect("/foyer");
  const persons = listPersons(db(), h.id);
  const year = Number(today().slice(0, 4));
  return (
    <Page>
      <PageHeader
        title="Importer une police"
        subtitle="Photographiez votre police ou votre carte d'assuré, ou choisissez le PDF reçu de la caisse : la caisse, les personnes, le produit, la franchise, la prime et les complémentaires sont repris. Vous vérifiez avant d'enregistrer."
        back="/foyer"
      />
      <ImportFlow
        hasPersons={persons.length > 0}
        insurers={listInsurers(db()).map((i) => ({ id: i.id, name: insurerLabel(i) })).sort((a, b) => a.name.localeCompare(b.name, "fr"))}
        years={Array.from({ length: year + 2 - 2010 }, (_, i) => year + 1 - i)}
      />
    </Page>
  );
}
