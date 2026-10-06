import { redirect } from "next/navigation";
import { getHousehold } from "@/application/household";
import { getReviewByYear, getReviewView } from "@/application/review";
import { domicileLabel, domicileOf } from "@/domain/domicile";
import { db, today } from "@/server/context";
import { pageScope } from "@/server/auth";
import { Page, PageHeader } from "@/ui/page";
import { DomicileForm } from "./domicile-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Domicile" };

/** Domicile au 1er janvier de l'année cible : un déménagement avant cette date change les primes. */
export default async function DomicilePage({ params }: { params: Promise<{ year: string }> }) {
  const scope = await pageScope();
  const year = Number((await params).year);
  const reviewRow = getReviewByYear(db(), scope, year);
  if (!reviewRow || reviewRow.status === "CLOSED") redirect(`/bilan/${year}`);
  const view = getReviewView(db(), scope, reviewRow.id, today());
  const home = getHousehold(db(), scope)!;
  const first = view.lines[0]?.line;
  return (
    <Page>
      <PageHeader
        title={`Domicile au 1er janvier ${year}`}
        subtitle={`Les primes ${year} dépendent de la commune où vous habiterez le 1er janvier. Si vous déménagez avant, indiquez la nouvelle commune.`}
        back={`/bilan/${year}`}
      />
      <DomicileForm
        year={year}
        reviewId={reviewRow.id}
        place={first ? { postalCode: first.bfsNumber === home.bfsNumber ? home.postalCode : "", ...domicileOf(first) } : { ...home }}
        persons={view.lines.map((p) => ({
          personId: p.person.id,
          firstName: p.person.firstName,
          domicile: domicileLabel(p.line),
          decided: p.line.decision !== "UNDECIDED",
        }))}
      />
    </Page>
  );
}
