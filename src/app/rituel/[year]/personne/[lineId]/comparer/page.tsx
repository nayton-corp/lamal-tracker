import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { decideAction } from "@/app/actions/review";
import { compareForLine, offerKey, type DetailedOffer } from "@/application/compare";
import { MODEL_DETAILS, MODEL_LABEL, displayTariffLabel } from "@/domain/lamal";
import { db } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { Alert } from "@/ui/alert";
import { cn } from "@/ui/cn";
import { Chf, Saving } from "@/ui/money";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comparer des offres" };

const pct = (permille: number) => `${permille >= 0 ? "+" : ""}${(permille / 10).toFixed(1)} %`;

export default async function ComparePage({ params, searchParams }: { params: Promise<{ year: string; lineId: string }>; searchParams: Promise<{ c?: string }> }) {
  const { year: y, lineId: l } = await params;
  const year = Number(y);
  const lineId = Number(l);
  const keys = ((await searchParams).c ?? "").split(",").filter(Boolean);
  let view;
  try {
    view = compareForLine(db(), lineId, { all: true, everyOffer: true });
  } catch {
    notFound();
  }
  const offers = keys.map((k) => view.offers.find((o) => offerKey(o) === k)).filter((o): o is DetailedOffer => Boolean(o));
  const back = `/rituel/${year}/personne/${lineId}?c=${keys.join(",")}`;

  if (offers.length < 2) {
    return (
      <Page>
        <PageHeader title="Comparer des offres" back={back} />
        <Alert tone="info" title="Choisissez au moins deux offres">
          Dans la liste, ouvrez une offre et cochez « Comparer côte à côte ».
        </Alert>
      </Page>
    );
  }

  const best = (f: (o: DetailedOffer) => number) => Math.min(...offers.map(f));
  const row = (label: string, cell: (o: DetailedOffer) => ReactNode, highlight?: (o: DetailedOffer) => number) => (
    <tr className="border-t border-border align-top">
      <th scope="row" className="sticky left-0 z-10 w-32 bg-surface p-3 text-left text-sm font-normal text-muted">
        {label}
      </th>
      {offers.map((o) => (
        <td key={offerKey(o)} className={cn("p-3 text-sm", highlight && highlight(o) === best(highlight) && "bg-saving-soft font-semibold")}>
          {cell(o)}
        </td>
      ))}
    </tr>
  );
  const group = (title: string) => (
    <tr className="border-t border-border bg-surface-2">
      <th scope="rowgroup" colSpan={offers.length + 1} className="sticky left-0 p-2 text-left text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
      </th>
    </tr>
  );

  return (
    <Page wide>
      <PageHeader title="Comparer des offres" subtitle={`${view.personName} · ${year} · en vert, le meilleur de chaque ligne`} back={back} />
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
        <table className="w-full min-w-[36rem] border-collapse">
          <caption className="sr-only">Offres comparées côte à côte</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface p-3" />
              {offers.map((o) => (
                <th key={offerKey(o)} scope="col" className="min-w-40 p-3 text-left align-top">
                  <span className="block font-semibold">{o.insurerName}</span>
                  <span className="block text-sm font-normal text-muted">
                    {displayTariffLabel(o.tariffLabel, o.modelType)} · franchise {o.franchiseChf}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group("Coûts")}
            {row("Prime / mois", (o) => <Chf rp={o.monthlyPremiumRp} />, (o) => o.monthlyPremiumRp)}
            {row("Sans frais de santé / an", (o) => <Chf rp={o.scenarios.noCostsRp} whole />, (o) => o.scenarios.noCostsRp)}
            {row("Vos frais attendus / an", (o) => <Chf rp={o.scenarios.expectedRp} whole />, (o) => o.scenarios.expectedRp)}
            {row("Année chargée / an", (o) => <Chf rp={o.scenarios.worstRp} whole />, (o) => o.scenarios.worstRp)}
            {row("Par rapport au renouvellement", (o) => (o.savingsRp === null ? "—" : <Saving rp={o.savingsRp} />))}
            {row("Franchise et quote-part max", (o) => (
              <>
                CHF {o.franchiseChf} + <Chf rp={view.coinsuranceMaxRp} whole />
              </>
            ))}
            {group("Le modèle")}
            {row("Modèle", (o) => {
              const d = o.standardMonthlyRp && o.modelType !== "STANDARD" ? Math.round(((o.standardMonthlyRp - o.monthlyPremiumRp) * 100) / o.standardMonthlyRp) : null;
              return (
                <>
                  {MODEL_LABEL[o.modelType]}
                  {d !== null && d > 0 && <span className="block text-muted">{d} % moins cher que le standard de la caisse</span>}
                </>
              );
            })}
            {row("Premier recours", (o) => MODEL_DETAILS[o.modelType].firstContact)}
            {row("Accès direct", (o) => MODEL_DETAILS[o.modelType].exceptions)}
            {row("Règle", (o) => MODEL_DETAILS[o.modelType].rule)}
            {group("La caisse")}
            {row("Assurés", (o) => view.insurers[o.insurerId]?.profile?.insured?.toLocaleString("fr-CH") ?? "—")}
            {row("Réserves", (o) => {
              const m = view.insurers[o.insurerId]?.profile?.reservesMonths;
              return m == null ? "—" : `${m.toLocaleString("fr-CH")} mois de primes`;
            }, (o) => -(view.insurers[o.insurerId]?.profile?.reservesMonths ?? -Infinity))}
            {row("Frais administratifs", (o) => {
              const a = view.insurers[o.insurerId]?.profile?.adminPerInsuredRp;
              return a == null ? "—" : <><Chf rp={a} whole /> / assuré</>;
            }, (o) => view.insurers[o.insurerId]?.profile?.adminPerInsuredRp ?? Infinity)}
            {row("Hausse des primes / an", (o) => {
              const t = view.insurers[o.insurerId]?.profile?.trend;
              return t ? `${pct(t.insurerPermille)} (marché ${pct(t.marketPermille)}), ${t.fromYear}–${t.toYear}` : "—";
            }, (o) => view.insurers[o.insurerId]?.profile?.trend?.insurerPermille ?? Infinity)}
            {row("Contact", (o) => {
              const c = view.insurers[o.insurerId];
              return (
                <span className="space-y-1">
                  {c?.website && (
                    <a className="block text-primary underline" href={c.website} target="_blank" rel="noreferrer">
                      {c.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  {c?.phone && <span className="block">{c.phone}</span>}
                </span>
              );
            })}
            <tr className="border-t border-border">
              <th scope="row" className="sticky left-0 z-10 bg-surface p-3" />
              {offers.map((o) => (
                <td key={offerKey(o)} className="p-3">
                  {view.chosen.tariffCode === o.tariffCode && view.chosen.franchiseChf === o.franchiseChf ? (
                    <span className="text-sm font-semibold text-saving">Choisie</span>
                  ) : (
                    <ActionForm action={decideAction} hidden={{ year, lineId, tariffId: o.tariffId, franchiseChf: o.franchiseChf }}>
                      <SubmitButton size="sm" block pendingLabel="…">
                        Choisir
                      </SubmitButton>
                    </ActionForm>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">
        Année chargée : prime nette, franchise entière et quote-part maximale. Réserves et frais : comptes publiés par l&apos;OFSP ; hausse : prime du modèle standard dans votre région.
      </p>
    </Page>
  );
}

