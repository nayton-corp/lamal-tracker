import { LineChart as LineIcon } from "lucide-react";
import Link from "next/link";
import { householdHistory } from "@/application/history";
import { db } from "@/server/context";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { Chf } from "@/ui/money";
import { Badge } from "@/ui/badge";
import { cn } from "@/ui/cn";
import { MODEL_LABEL, type ModelType } from "@/domain/lamal";
import type { ReactNode } from "react";
import { EmptyState, Page, PageHeader } from "@/ui/page";
import { MarketChart, PersonChart, TotalsChart } from "./charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historique" };

export default function HistoryPage() {
  const h = householdHistory(db());
  if (h.years.length === 0) {
    return (
      <Page>
        <PageHeader title="Historique" />
        <EmptyState icon={<LineIcon aria-hidden />} title="Pas encore d'historique" action={<Button asChild><Link href="/foyer">Indiquer les contrats</Link></Button>}>
          Se construit à partir de vos contrats. Ajoutez les années passées si vous les avez.
        </EmptyState>
      </Page>
    );
  }
  const s = h.stats;
  const saved = s.ritualSavings.reduce((a, x) => a + Math.max(x.annualRp, 0), 0);
  const last = h.totals.at(-1)!;
  return (
    <Page wide>
      <PageHeader title="Historique" subtitle={`${h.years[0]}–${h.years.at(-1)} · primes réellement payées, comparées au marché`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Payé depuis ${h.years[0]}`} value={<Chf rp={s.totalPaidRp} whole />} hint="Primes LAMal du foyer, avant redistribution CO2." />
        <Stat
          label="Économisé grâce aux rituels"
          value={<Chf rp={saved} whole />}
          hint={s.ritualSavings.length ? s.ritualSavings.map((x) => `${x.year} : CHF ${Math.round(x.annualRp / 100)}`).join(" · ") : "Apparaît après la clôture d'un rituel."}
          tone={saved > 0 ? "saving" : undefined}
        />
        <Stat
          label="Hausse moyenne par an"
          value={s.avgChangePermille === null ? "—" : `${s.avgChangePermille >= 0 ? "+" : ""}${(s.avgChangePermille / 10).toFixed(1)} %`}
          hint={s.avgMarketChangePermille === null ? "Marché : primes passées non importées." : `Marché : ${s.avgMarketChangePermille >= 0 ? "+" : ""}${(s.avgMarketChangePermille / 10).toFixed(1)} % par an.`}
          tone={s.avgChangePermille !== null && s.avgMarketChangePermille !== null ? (s.avgChangePermille <= s.avgMarketChangePermille ? "saving" : "increase") : undefined}
        />
        <Stat
          label={`Écart avec le moins cher (${last.year})`}
          value={s.gapToCheapestAnnualRp === null ? "—" : <><Chf rp={s.gapToCheapestAnnualRp} whole />/an</>}
          hint="À franchise égale, pour tout le foyer."
          tone={s.gapToCheapestAnnualRp ? "increase" : undefined}
        />
      </div>
      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-8 lg:space-y-0">
        <Section title="Votre foyer et le marché">
          <Card>
            <MarketChart totals={h.totals} />
          </Card>
        </Section>
        <Section title="Foyer, prime mensuelle">
          <Card>
            <TotalsChart totals={h.totals} />
          </Card>
        </Section>
        <Section title="Par personne, après redistribution CO2">
          <Card>
            <PersonChart persons={h.persons} years={h.years} />
          </Card>
        </Section>
        <Section title="Parcours de chaque personne">
          <Card className="space-y-4">
            {h.persons.map((p) => (
              <div key={p.personId} className="space-y-1">
                <p className="font-medium">{p.name}</p>
                <ol className="space-y-1 text-sm">
                  {p.points.map((pt, i) => {
                    const prev = p.points[i - 1];
                    const changes = prev
                      ? [prev.insurer !== pt.insurer && "nouvelle caisse", prev.modelType !== pt.modelType && "nouveau modèle", prev.franchiseChf !== pt.franchiseChf && "nouvelle franchise"].filter(Boolean)
                      : [];
                    return (
                      <li key={pt.year} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="w-10 font-semibold tabular">{pt.year}</span>
                        <span>
                          {pt.insurer} · {MODEL_LABEL[pt.modelType as ModelType] ?? pt.modelType} · F {pt.franchiseChf}
                        </span>
                        {changes.map((c) => (
                          <Badge key={String(c)} tone="primary" className="text-xs">
                            {c}
                          </Badge>
                        ))}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </Card>
        </Section>
      </div>
      <Section title="Détail">
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Prime mensuelle brute par personne et par année</caption>
            <thead className="bg-surface-2 text-left">
              <tr>
                <th scope="col" className="p-3">Année</th>
                {h.persons.map((p) => (
                  <th key={p.personId} scope="col" className="p-3 text-right">{p.name}</th>
                ))}
                <th scope="col" className="p-3 text-right">Foyer</th>
              </tr>
            </thead>
            <tbody>
              {[...h.totals].reverse().map((t) => (
                <tr key={t.year} className="border-t border-border">
                  <th scope="row" className="p-3 text-left tabular">{t.year}</th>
                  {h.persons.map((p) => {
                    const pt = p.points.find((x) => x.year === t.year);
                    return (
                      <td key={p.personId} className="p-3 text-right align-top">
                        {pt ? (
                          <>
                            <Chf rp={pt.billedMonthlyRp} />
                            <span className="block truncate text-xs text-muted">{pt.insurer}</span>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-3 text-right font-semibold">
                    <Chf rp={t.billedMonthlyRp} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </Page>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "saving" | "increase" }) {
  return (
    <Card className="space-y-1">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("text-xl font-semibold tabular", tone === "saving" && "text-saving", tone === "increase" && "text-increase")}>{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </Card>
  );
}
