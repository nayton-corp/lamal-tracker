import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { app } from "@/server/app";
import { PersonForm } from "@/ui/forms/household-forms";
import { Card, PageHeader } from "@/ui/primitives";

export const metadata: Metadata = { title: "Nouvelle personne" };

export default function NewPersonPage() {
  if (!app().household.household()) redirect("/foyer/edition");
  return (
    <>
      <PageHeader title="Nouvelle personne" back="/foyer" />
      <Card>
        <PersonForm />
      </Card>
    </>
  );
}
