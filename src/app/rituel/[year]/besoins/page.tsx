import Link from "next/link";
import { redirect } from "next/navigation";
import { getReviewByYear, getReviewView } from "@/application/review";
import { effectiveNeeds } from "@/application/strategy";
import { displayTariffLabel, type ModelType } from "@/domain/lamal";
import { franchisesFor } from "@/domain/parameters";
import { STRATEGY_INFO } from "@/domain/strategy";
import { parametersFor } from "@/infrastructure/db/queries";
import { db, today } from "@/server/context";
import { Page, PageHeader } from "@/ui/page";
import { NeedsForm, type NeedsPerson } from "./needs-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vos besoins" };

export default async function NeedsPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  const r = getReviewByYear(db(), year);
  if (!r || r.status === "CLOSED") redirect(`/rituel/${year}`);
  const view = getReviewView(db(), r.id, today());
  const params_ = parametersFor(db(), year);
  const open = view.persons.filter((p) => p.line.decision === "UNDECIDED");
  const persons: NeedsPerson[] = (open.length ? open : view.persons).map((p) => {
    const needs = effectiveNeeds({ line: p.line, person: p.person });
    return {
      lineId: p.line.id,
      firstName: p.person.firstName,
      current: `${p.currentInsurer}, ${displayTariffLabel(p.policy.tariffLabel, p.policy.modelType as ModelType)}, franchise ${p.policy.franchiseChf}`,
      currentModel: p.policy.modelType as ModelType,
      currentFranchise: p.line.renewalFranchiseChf,
      franchises: franchisesFor(params_, p.line.targetAgeClass),
      franchise: needs.franchiseChf,
      models: needs.models,
      healthCostsRp: p.person.healthCostsRp,
      doctorName: p.person.doctorName,
      accident: p.line.accident,
      transition: p.transition,
    };
  });

  return (
    <Page>
      <PageHeader
        title={persons.length > 1 ? "Vos besoins" : "Votre besoin"}
        subtitle={
          <>
            {r.strategy ? (
              <>
                Pré-rempli pour la stratégie <strong>{STRATEGY_INFO[r.strategy].label}</strong> (<Link href={`/rituel/${year}/strategie`} className="text-primary underline">changer</Link>).{" "}
              </>
            ) : null}
            Vérifiez ou ajustez, puis comparez.
          </>
        }
        back={`/rituel/${year}`}
      />
      <NeedsForm year={year} reviewId={r.id} persons={persons} strategyLabel={r.strategy ? STRATEGY_INFO[r.strategy].label : null} />
    </Page>
  );
}
