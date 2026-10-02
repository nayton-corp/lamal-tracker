import type { Metadata } from "next";
import { householdHistory } from "@/application/history";
import { relativeChangeBp } from "@/domain/money";
import { app } from "@/server/app";
import { Chf, Delta } from "@/ui/amount";
import { HouseholdBars, PremiumLines } from "@/ui/history/history-charts";
import { Badge, ButtonLink, Card, CardTitle, EmptyState, PageHeader } from "@/ui/primitives";

export const metadata: Metadata = { title: "Historique" };

export default function HistoryPage() {
  const ctx = app();
  if (!ctx.household.household()) {
    return (
      <>
        <PageHeader title="Historique" />
        <EmptyState title="Aucun foyer configuré" action={<ButtonLink href="/foyer/edition">Configurer le foyer</ButtonLink>}>
          L&apos;historique se construit à partir des contrats saisis et des rituels clôturés.
        </EmptyState>
      </>
    );
  }
  const { people, totals, years } = householdHistory(ctx);
  if (years.length === 0) {
    return (
      <>
        <PageHeader title="Historique" />
        <EmptyState title="Pas encore d'historique" action={<ButtonLink href="/foyer">Saisir les contrats</ButtonLink>}>
          Saisis les contrats de l&apos;année en cours (et des années passées si tu les as) pour suivre l&apos;évolution.
        </EmptyState>
      </>
    );
  }
  const last = totals.at(-1)!;
  const prev = totals.at(-2);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Historique" subtitle={`${years[0]}–${years.at(-1)} · primes nettes de la redistribution CO2`} />
      <Card>
        <CardTitle>Foyer</CardTitle>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              {last.year}
              {last.projected && " (projeté)"}
            </p>
            <Chf rp={last.netAnnualRp} className="text-2xl font-bold" />
            <span className="text-sm text-muted"> /an net</span>
          </div>
          {prev && prev.netAnnualRp > 0 && (
            <Delta rp={last.netAnnualRp - prev.netAnnualRp} bp={relativeChangeBp(prev.netAnnualRp, last.netAnnualRp)} suffix={` vs ${prev.year}`} />
          )}
        </div>
        <HouseholdBars totals={totals} />
        {totals.some((t) => t.projected) && <p className="mt-1 text-xs text-muted">* année du rituel en cours, selon les décisions prises.</p>}
      </Card>
      <Card>
        <CardTitle>Primes mensuelles</CardTitle>
        <PremiumLines people={people} years={years} />
        <p className="mt-1 text-xs text-muted">En pointillés : médiane du marché pour la même franchise, région et classe d&apos;âge.</p>
      </Card>
      {people.map((p) => (
        <Card key={p.personId}>
          <CardTitle>{p.firstName}</CardTitle>
          {p.points.length === 0 ? (
            <p className="text-sm text-muted">Aucun contrat enregistré.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="num w-full min-w-[22rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 font-medium">Année</th>
                    <th className="py-1 font-medium">Caisse</th>
                    <th className="py-1 text-right font-medium">Mensuel</th>
                    <th className="py-1 text-right font-medium">Médiane</th>
                  </tr>
                </thead>
                <tbody>
                  {p.points.map((pt, i) => {
                    const before = p.points[i - 1];
                    return (
                      <tr key={pt.year} className="border-t border-border align-top">
                        <td className="py-2 font-semibold">
                          {pt.year}
                          {pt.projected && (
                            <Badge tone="info" className="ml-1">
                              projeté
                            </Badge>
                          )}
                        </td>
                        <td className="py-2">
                          <span className="block max-w-[9rem] truncate">{pt.insurerName ?? "–"}</span>
                          <span className="text-xs text-muted">{pt.franchiseChf !== null ? `franchise ${pt.franchiseChf}` : ""}</span>
                        </td>
                        <td className="py-2 text-right">
                          {pt.monthlyRp !== null ? <Chf rp={pt.monthlyRp} /> : "–"}
                          {before?.monthlyRp && pt.monthlyRp !== null && (
                            <span className="block text-xs">
                              <Delta rp={pt.monthlyRp - before.monthlyRp} bp={relativeChangeBp(before.monthlyRp, pt.monthlyRp)} />
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-right text-muted">{pt.marketMedianRp !== null ? <Chf rp={pt.marketMedianRp} /> : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
