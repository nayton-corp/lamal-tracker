import { redirect } from "next/navigation";
import { getHousehold, getHouseholdMode } from "@/application/household";
import { currentYear, db } from "@/server/context";
import { Card } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { PersonForm } from "../../person-form";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouvelle personne" };

export default async function NewPersonPage() {
  const scope = await pageScope();
  if (!getHousehold(db(), scope)) redirect("/bienvenue");
  const solo = getHouseholdMode(db(), scope) === "SOLO";
  return (
    <Page>
      <PageHeader title={solo ? "Passer en foyer" : "Nouvelle personne"} subtitle={solo ? "Ajoutez une personne : l'app passe en mode foyer, avec un seul rituel pour tous." : undefined} back="/foyer" />
      <Card>
        <PersonForm person={null} year={currentYear()} />
      </Card>
    </Page>
  );
}
