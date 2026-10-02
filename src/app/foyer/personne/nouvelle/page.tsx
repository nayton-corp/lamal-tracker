import { redirect } from "next/navigation";
import { getHousehold, listInsurers } from "@/application/household";
import { insurerLabel } from "@/infrastructure/db/queries";
import { db, today } from "@/server/context";
import { Card } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { PersonForm } from "../../person-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouvelle personne" };

export default function NewPersonPage() {
  if (!getHousehold(db())) redirect("/foyer");
  const insurers = listInsurers(db()).map((i) => ({ id: i.id, name: insurerLabel(i) }));
  return (
    <Page>
      <PageHeader title="Nouvelle personne" back="/foyer" />
      <Card>
        <PersonForm person={null} insurers={insurers} year={Number(today().slice(0, 4))} />
      </Card>
    </Page>
  );
}
