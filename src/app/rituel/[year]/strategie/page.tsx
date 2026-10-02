import { Check, PiggyBank, Repeat, Scale } from "lucide-react";
import { redirect } from "next/navigation";
import { chooseStrategyAction } from "@/app/actions/journey";
import { getReviewByYear } from "@/application/review";
import { strategyOverview } from "@/application/strategy";
import { displayTariffLabel } from "@/domain/lamal";
import { formatChf } from "@/domain/money";
import { STRATEGY_INFO, type Strategy } from "@/domain/strategy";
import { db } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { cn } from "@/ui/cn";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stratégie" };

const ICONS: Record<Strategy, typeof PiggyBank> = { ECONOMY: PiggyBank, KEEP: Repeat, BALANCE: Scale };

export default async function StrategyPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  const r = getReviewByYear(db(), year);
  if (!r || r.status === "CLOSED") redirect(`/rituel/${year}`);
  const overview = strategyOverview(db(), r.id);
  const several = overview[0]!.persons.length > 1;

  return (
    <Page>
      <PageHeader
        title="Quelle stratégie ?"
        subtitle={`Économie annuelle estimée${several ? " du foyer" : ""} par rapport à la reconduction. Ajustable ensuite.`}
        back={`/rituel/${year}`}
      />
      <ul className="space-y-3">
        {overview.map((o) => {
          const info = STRATEGY_INFO[o.strategy];
          const Icon = ICONS[o.strategy];
          const active = r.strategy === o.strategy;
          return (
            <li key={o.strategy}>
              <ActionForm action={chooseStrategyAction} hidden={{ year, reviewId: r.id, strategy: o.strategy }}>
                <article className={cn("space-y-3 rounded-2xl border-2 bg-surface p-4 shadow-card", active ? "border-primary" : "border-border")} aria-labelledby={`strategie-${o.strategy}`}>
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 id={`strategie-${o.strategy}`} className="text-lg font-semibold">
                        {info.label}
                        {active && <Check aria-label="choisie" className="ml-2 inline size-4 text-saving" />}
                      </h2>
                      <p className="text-sm">{info.tagline}</p>
                    </div>
                    <p className="shrink-0 text-right">
                      <span className="block text-xs text-muted">Économie</span>
                      <span className={cn("block text-lg font-bold tabular", (o.annualSavingsRp ?? 0) > 0 ? "text-saving" : "text-muted")}>
                        {o.annualSavingsRp === null ? "—" : o.annualSavingsRp > 0 ? `${formatChf(o.annualSavingsRp, { whole: true })}/an` : "aucune"}
                      </span>
                    </p>
                  </div>
                  <ul className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
                    {o.persons.map((p) => (
                      <li key={p.lineId} className="flex justify-between gap-2">
                        <span className="min-w-0">
                          {several && <strong>{p.firstName} : </strong>}
                          {p.offer ? `${p.offer.insurerName}, ${displayTariffLabel(p.offer.tariffLabel, p.offer.modelType)}, franchise ${p.offer.franchiseChf}` : "aucune offre"}
                        </span>
                        {p.offer && <span className="shrink-0 tabular">{formatChf(p.offer.monthlyPremiumRp)}/mois</span>}
                      </li>
                    ))}
                  </ul>
                  <details className="text-sm">
                    <summary className="min-h-11 cursor-pointer content-center text-primary">Comment ça marche</summary>
                    <p className="text-muted">{info.how}</p>
                    <p className="mt-1 text-muted">
                      <strong className="text-foreground">En échange :</strong> {info.tradeoff}
                    </p>
                  </details>
                  <SubmitButton block variant={active ? "secondary" : "primary"} pendingLabel="…">
                    {active ? `Garder « ${info.label} »` : `Choisir « ${info.label} »`}
                  </SubmitButton>
                </article>
              </ActionForm>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        Changer de caisse de base ne touche pas vos complémentaires (LCA), et la nouvelle caisse doit vous accepter sans questionnaire de santé (art. 4 LAMal).
      </p>
    </Page>
  );
}
