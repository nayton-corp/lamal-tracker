import { redirect } from "next/navigation";
import { getHousehold, getHouseholdMode } from "@/application/household";
import { db, today } from "@/server/context";
import { Card } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { PersonForm } from "../../person-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouvelle personne" };

export default function NewPersonPage() {
  if (!getHousehold(db())) redirect("/bienvenue");
  const solo = getHouseholdMode(db()) === "SOLO";
  return (
    <Page>
      <PageHeader title={solo ? "Passer en foyer" : "Nouvelle personne"} subtitle={solo ? "Ajoutez une personne : l'app passe en mode foyer, avec un seul rituel pour tous." : undefined} back="/foyer" />
      <Card>
        <PersonForm person={null} year={Number(today().slice(0, 4))} />
      </Card>
    </Page>
  );
}
