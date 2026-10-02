import { notFound } from "next/navigation";
import { app } from "@/server/app";
import { PersonForm } from "@/ui/forms/household-forms";
import { Card, PageHeader } from "@/ui/primitives";

export default async function EditPersonPage({ params }: PageProps<"/foyer/[personId]/edition">) {
  const { personId } = await params;
  const person = app().household.person(Number(personId));
  if (!person) notFound();
  return (
    <>
      <PageHeader title={`Modifier ${person.firstName}`} back={`/foyer/${person.id}`} />
      <Card>
        <PersonForm values={person} />
      </Card>
    </>
  );
}
