import { redirect } from "next/navigation";
import { getReviewByYear, getReviewView } from "@/application/review";
import { defaultsFor, effectiveNeeds, lineContext, strategyOverview } from "@/application/strategy";
import { displayTariffLabel, type ModelType } from "@/domain/lamal";
import { franchisesFor } from "@/domain/parameters";
import { STRATEGIES } from "@/domain/strategy";
import { legalParameters } from "@/application/reference-data";
import { db, today } from "@/server/context";
import { Page, PageHeader } from "@/ui/page";
import { PreferencesForm, type PreferencesPerson, type StrategyChoice } from "./preferences-form";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Préférences" };

/** Préférences du rituel : ce qui compte le plus pour le foyer, puis les besoins de chaque personne. */
export default async function PreferencesPage({ params }: { params: Promise<{ year: string }> }) {
  const scope = await pageScope();
  const year = Number((await params).year);
  const reviewRow = getReviewByYear(db(), scope, year);
  if (!reviewRow || reviewRow.status === "CLOSED") redirect(`/rituel/${year}`);
  const view = getReviewView(db(), scope, reviewRow.id, today());
  const params_ = legalParameters(db(), year);
  const open = view.lines.filter((p) => p.line.decision === "UNDECIDED");
  // Jamais réglées : on part de « Payer le moins possible » et de ses réglages.
  const saved = reviewRow.needsConfirmedAt !== null && reviewRow.strategy !== null;
  const strategy = reviewRow.strategy ?? "ECONOMY";
  const persons: PreferencesPerson[] = (open.length ? open : view.lines).map((p) => {
    const c = lineContext(db(), scope, p.line.id);
    const needs = saved ? effectiveNeeds(c) : defaultsFor(c, strategy);
    return {
      lineId: p.line.id,
      firstName: p.person.firstName,
      current: `${p.currentInsurerName}, ${displayTariffLabel(p.policy.tariffLabel, p.policy.modelType as ModelType)}, franchise ${p.policy.franchiseChf}`,
      currentModel: p.policy.modelType as ModelType,
      currentFranchise: p.line.renewalFranchiseChf,
      franchises: franchisesFor(params_, p.line.targetAgeClass),
      franchise: needs.franchiseChf,
      models: needs.models,
      defaults: Object.fromEntries(STRATEGIES.map((s) => [s, defaultsFor(c, s)])) as PreferencesPerson["defaults"],
      healthCostsRp: p.person.healthCostsRp,
      doctorName: p.person.doctorName,
      accident: p.line.accident,
      transition: p.ageTransitionMessage,
    };
  });
  const choices: StrategyChoice[] = strategyOverview(db(), scope, reviewRow.id).map((o) => ({
    strategy: o.strategy,
    annualSavingsRp: o.annualSavingsRp,
    persons: o.persons.map((p) => ({
      lineId: p.lineId,
      firstName: p.firstName,
      offer: p.offer
        ? { summary: `${p.offer.insurerName}, ${displayTariffLabel(p.offer.tariffLabel, p.offer.modelType)}, franchise ${p.offer.franchiseChf}`, monthlyRp: p.offer.monthlyPremiumRp }
        : null,
    })),
  }));

  return (
    <Page>
      <PageHeader title="Vos préférences" subtitle="Deux questions, puis l'app vous montre les meilleures offres. Tout reste modifiable." back={`/rituel/${year}`} />
      <PreferencesForm year={year} reviewId={reviewRow.id} strategy={strategy} choices={choices} persons={persons} />
    </Page>
  );
}
