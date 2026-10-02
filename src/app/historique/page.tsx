import { LineChart as LineIcon } from "lucide-react";
import Link from "next/link";
import { householdHistory } from "@/application/history";
import { db } from "@/server/context";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { Chf, Delta } from "@/ui/money";
import { EmptyState, Page, PageHeader } from "@/ui/page";
import { PersonChart, TotalsChart } from "./charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Historique" };

export default function HistoryPage() {
  const h = householdHistory(db());
  if (h.years.length === 0) {
    return (
      <Page>
        <PageHeader title="Historique" />
        <EmptyState icon={<LineIcon aria-hidden />} title="Pas encore d'historique" action={<Button asChild><Link href="/foyer">Saisir les contrats</Link></Button>}>
          L&apos;historique se construit à partir des contrats de chaque année. Saisissez aussi les années passées si vous avez les polices.
        </EmptyState>
      </Page>
    );
  }
  const first = h.totals[0]!;
  const last = h.totals.at(-1)!;
  return (
    <Page>
      <PageHeader title="Historique" subtitle={`${h.years[0]}–${h.years.at(-1)} · primes réellement facturées`} />
      {h.totals.length > 1 && (
        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Depuis {first.year}</p>
            <Delta rp={last.billedMonthlyRp - first.billedMonthlyRp} permille={first.billedMonthlyRp ? Math.round(((last.billedMonthlyRp - first.billedMonthlyRp) * 1000) / first.billedMonthlyRp) : null} suffix="/mois" className="text-lg" />
          </div>
          <div className="text-right text-sm text-muted">
            Par an en {last.year}
            <Chf rp={last.billedMonthlyRp * 12} whole className="block text-lg font-semibold text-foreground" />
          </div>
        </Card>
      )}
      <Section title="Foyer, prime mensuelle">
        <Card>
          <TotalsChart totals={h.totals} />
        </Card>
      </Section>
      <Section title="Par personne, prime nette de CO2">
        <Card>
          <PersonChart persons={h.persons} years={h.years} />
        </Card>
      </Section>
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
