import { BadgeCheck, CircleAlert, ExternalLink, Stethoscope, TrendingDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { confirmLineageAction, decideAction, keepAction } from "@/app/actions/review";
import { compareForLine, type CompareView } from "@/application/compare";
import { insurerLabel } from "@/infrastructure/db/queries";
import { insurer, lamalPolicy, reviewLine } from "@/infrastructure/db/schema";
import type { InsurerProfile } from "@/domain/insurer-profile";
import { AGE_CLASS_LABEL, MODEL_HINT, MODEL_LABEL, MODEL_TYPES, displayTariffLabel, type ModelType } from "@/domain/lamal";
import type { RankedOffer } from "@/domain/comparison";
import { db } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Chf, Saving } from "@/ui/money";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";
import { FilterBar } from "./filter-bar";
import { FranchiseSimulator } from "./simulator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comparateur" };

type Search = { m?: string; f?: string; sort?: string; all?: string; n?: string; every?: string };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ year: string; lineId: string }>; searchParams: Promise<Search> }) {
  const { year: y, lineId: l } = await params;
  const sp = await searchParams;
  const year = Number(y);
  const lineId = Number(l);
  const line = db().select().from(reviewLine).where(eq(reviewLine.id, lineId)).get();
  if (!line) notFound();
  const policy = db().select().from(lamalPolicy).where(eq(lamalPolicy.id, line.currentPolicyId)).get()!;
  const currentInsurer = db().select().from(insurer).where(eq(insurer.id, policy.insurerId)).get()!;

  const models = (sp.m ?? "").split(",").filter((m): m is ModelType => (MODEL_TYPES as readonly string[]).includes(m));
  const view = compareForLine(db(), lineId, {
    models,
    franchises: sp.f ? [Number(sp.f)] : undefined,
    sort: sp.sort === "premium" ? "premium" : "total",
    all: sp.all === "1",
    everyOffer: sp.every === "1",
  });
  const every = sp.every === "1";
  const limit = sp.n === "all" ? view.offers.length : 30;

  return (
    <Page wide>
      <PageHeader
        title={view.personName}
        subtitle={`${AGE_CLASS_LABEL[line.targetAgeClass]} en ${year} · ${line.accident ? "avec" : "sans"} accident`}
        back={`/rituel/${year}#ligne-${lineId}`}
      />

      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-8 lg:space-y-0">
      <aside className="space-y-6 lg:sticky lg:top-8">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Contrat actuel ({year - 1})</p>
            <p className="font-semibold">{insurerLabel(currentInsurer)}</p>
            <p className="text-sm text-muted">
              {displayTariffLabel(policy.tariffLabel, policy.modelType as ModelType)} · franchise {policy.franchiseChf}
            </p>
          </div>
          <p className="text-right">
            <Chf rp={policy.billedMonthlyRp} className="font-semibold" />
            <span className="block text-sm text-muted">/mois</span>
          </p>
        </div>
        <RenewalBlock view={view} year={year} lineId={lineId} modelType={policy.modelType as ModelType} />
      </Card>

      <Section title="Filtrer les offres">
        <FilterBar franchises={view.allowedFranchises} />
        <p className="text-sm text-muted">
          Le coût total compte la prime et ce que vous paieriez de votre poche (franchise, 10 % de quote-part) pour des frais de santé de{" "}
          <Chf rp={view.healthCostsRp} whole /> par an.
        </p>
        <FranchiseSimulator lineId={lineId} franchises={view.curve.franchises} points={view.curve.points} breakEvenRp={view.curve.breakEvenRp} healthCostsRp={view.healthCostsRp} />
      </Section>
      </aside>

      <Section title={every ? `${view.offers.length} offre(s) ${year}, les moins chères d'abord` : `${view.offers.length} caisse(s) en ${year}, la moins chère d'abord`}>
        <BestSummary view={view} every={every} />
        {view.offers.length === 0 ? (
          <Alert tone="info" title="Aucune offre avec ces filtres">
            Choisissez « Toutes franchises » ou d&apos;autres modèles d&apos;assurance.
          </Alert>
        ) : (
          <ol className="space-y-2">
            {view.offers.slice(0, limit).map((o) => (
              <li key={`${o.tariffId}-${o.franchiseChf}`}>
                <OfferCard offer={o} view={view} year={year} lineId={lineId} />
              </li>
            ))}
          </ol>
        )}
        {view.offers.length > limit && (
          <Button asChild variant="secondary" block>
            <Link href={`?${new URLSearchParams({ ...sp, n: "all" } as Record<string, string>).toString()}`} scroll={false}>
              Afficher les {view.offers.length - limit} autres offres
            </Link>
          </Button>
        )}
      </Section>
      </div>
    </Page>
  );
}

function BestSummary({ view, every }: { view: CompareView; every: boolean }) {
  const best = view.offers[0];
  if (!best) return null;
  return (
    <Card className="space-y-1">
      {best.savingsRp !== null && best.savingsRp > 0 ? (
        <p className="flex items-start gap-2">
          <TrendingDown aria-hidden className="mt-0.5 size-5 shrink-0 text-saving" />
          <span>
            En changeant pour <strong>{best.insurerName}</strong> ({displayTariffLabel(best.tariffLabel, best.modelType)}, franchise {best.franchiseChf}), vous économiseriez{" "}
            <Chf rp={best.savingsRp} whole className="font-semibold text-saving" /> par an par rapport au renouvellement.
          </span>
        </p>
      ) : (
        <p>Avec ces filtres, aucune offre ne coûte moins que votre renouvellement.</p>
      )}
      <p className="text-sm text-muted">
        {every
          ? `${view.matchingOffers} offres sur ${view.totalOffers} pour ce profil.`
          : `Meilleure offre de chaque caisse, parmi ${view.matchingOffers} offres (${view.totalOffers} pour ce profil).`}
      </p>
    </Card>
  );
}

function RenewalBlock({ view, year, lineId, modelType }: { view: CompareView; year: number; lineId: number; modelType: ModelType }) {
  if ((view.renewalStatus === "MATCHED" || view.renewalStatus === "PROBABLE") && view.renewal) {
    return (
      <div className="space-y-2 rounded-xl bg-surface-2 p-3">
        <p className="text-sm">
          Sans rien faire en {year} : <strong>{displayTariffLabel(view.renewal.label, modelType)}</strong>, franchise {view.renewal.franchiseChf},{" "}
          <Chf rp={view.renewal.monthlyRp} className="font-semibold" />/mois.
        </p>
        {view.renewalStatus === "PROBABLE" && view.renewalCandidates.length > 1 && (
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer content-center text-primary">Ce n&apos;est pas le bon produit ?</summary>
            <RenewalChoices view={view} lineId={lineId} modelType={modelType} />
          </details>
        )}
        <ActionForm action={keepAction} hidden={{ year, lineId }}>
          <SubmitButton variant="secondary" block size="sm">
            Garder ce contrat
          </SubmitButton>
        </ActionForm>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CircleAlert aria-hidden className="size-4 shrink-0 text-increase" />
        {view.renewalStatus === "MISSING"
          ? `Votre caisse ne propose plus ce contrat dans votre région en ${year} : choisissez une nouvelle offre ci-dessous.`
          : `Votre caisse propose plusieurs produits proches en ${year} : lequel remplace le vôtre ?`}
      </p>
      <RenewalChoices view={view} lineId={lineId} modelType={modelType} />
    </div>
  );
}

function RenewalChoices({ view, lineId, modelType }: { view: CompareView; lineId: number; modelType: ModelType }) {
  return (
    <div className="space-y-2">
      {view.renewalCandidates.map((c) => (
        <ActionForm key={c.code} action={confirmLineageAction} hidden={{ lineId, toCode: c.code }} className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{displayTariffLabel(c.label, c.modelType ?? modelType)}</p>
            <p className="text-muted">
              {MODEL_LABEL[c.modelType]} · <Chf rp={c.monthlyRp} />
            </p>
          </div>
          <SubmitButton size="sm" variant={view.renewal?.label === c.label ? "primary" : "secondary"} pendingLabel="…">
            C&apos;est celui-ci
          </SubmitButton>
        </ActionForm>
      ))}
    </div>
  );
}

function OfferCard({ offer: o, view, year, lineId }: { offer: RankedOffer; view: CompareView; year: number; lineId: number }) {
  const isCurrent = o.insurerId === view.currentInsurerId;
  const isChosen = view.chosen.tariffCode === o.tariffCode && view.chosen.franchiseChf === o.franchiseChf && view.chosen.insurerId === o.insurerId;
  return (
    <details className={cn("group rounded-2xl border bg-surface shadow-card", isChosen ? "border-saving" : "border-border")}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular", o.rank <= 3 ? "bg-primary text-on-primary" : "bg-surface-2 text-muted")}>{o.rank}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{o.insurerName}</span>
          <span className="block truncate text-sm text-muted">
            {displayTariffLabel(o.tariffLabel, o.modelType)} · franchise {o.franchiseChf}
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            <Badge className="text-xs">{MODEL_LABEL[o.modelType]}</Badge>
            {isCurrent && <Badge tone="primary" className="text-xs">Votre caisse</Badge>}
            {isChosen && (
              <Badge tone="saving" className="text-xs">
                <BadgeCheck aria-hidden className="size-3" /> Choisie
              </Badge>
            )}
            {o.doctorCheck && (
              <Badge tone="info" className="text-xs">
                <Stethoscope aria-hidden className="size-3" /> Médecin à vérifier
              </Badge>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <Chf rp={o.monthlyPremiumRp} className="block font-semibold" />
          <Saving rp={o.savingsRp} className="block text-sm" />
        </span>
      </summary>
      <div className="space-y-3 border-t border-border p-3 text-sm">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-muted">Prime brute / an</dt>
          <dd className="text-right tabular"><Chf rp={o.cost.grossPremiumRp} /></dd>
          <dt className="text-muted">Redistribution CO2</dt>
          <dd className="text-right tabular">−<Chf rp={o.cost.co2Rp} /></dd>
          <dt className="text-muted">Franchise payée</dt>
          <dd className="text-right tabular"><Chf rp={o.cost.franchisePartRp} /></dd>
          <dt className="text-muted">Quote-part (10 %)</dt>
          <dd className="text-right tabular"><Chf rp={o.cost.coinsurancePartRp} /></dd>
          <dt className="font-medium">Coût total attendu</dt>
          <dd className="text-right font-semibold tabular"><Chf rp={o.cost.totalRp} /></dd>
        </dl>
        <p className="text-muted">
          <strong className="font-medium text-foreground">{MODEL_LABEL[o.modelType]} :</strong> {MODEL_HINT[o.modelType]}
          {o.doctorCheck && " Vérifiez sur le site de la caisse que votre médecin figure dans la liste."}
        </p>
        <InsurerFacts name={o.insurerName} card={view.insurers[o.insurerId]} />
        {!isChosen && (
          <ActionForm action={decideAction} hidden={{ year, lineId, tariffId: o.tariffId, franchiseChf: o.franchiseChf }}>
            <SubmitButton block pendingLabel="Enregistrement…">
              {isCurrent ? "Choisir (changement chez ma caisse)" : `Choisir ${o.insurerName}`}
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </details>
  );
}

const LEVEL_WORD = { LOW: "bas", MID: "moyen", HIGH: "élevé" } as const;

/** Portrait public de la caisse : solidité, frais, évolution des primes dans la région. */
function InsurerFacts({ name, card }: { name: string; card: { website: string | null; profile: InsurerProfile | null } | undefined }) {
  const p = card?.profile;
  if (!p && !card?.website) return null;
  const trendText = p?.trend
    ? `${p.trend.insurerPermille >= 0 ? "+" : ""}${(p.trend.insurerPermille / 10).toFixed(1)} % par an de ${p.trend.fromYear} à ${p.trend.toYear} (marché ${p.trend.marketPermille >= 0 ? "+" : ""}${(p.trend.marketPermille / 10).toFixed(1)} %)`
    : null;
  return (
    <div className="space-y-2 rounded-xl bg-surface-2 p-3">
      <p className="font-medium">La caisse {name}</p>
      {p && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {p.insured !== null && (
            <>
              <dt className="text-muted">Assurés</dt>
              <dd className="text-right tabular">{p.insured.toLocaleString("fr-CH")}</dd>
            </>
          )}
          {p.reservesMonths !== null && (
            <>
              <dt className="text-muted">Réserves</dt>
              <dd className="text-right">
                {p.reservesMonths.toLocaleString("fr-CH")} mois de primes{" "}
                <Badge tone={p.reservesLevel === "LOW" ? "increase" : p.reservesLevel === "HIGH" ? "saving" : "neutral"} className="text-xs">
                  {p.reservesLevel === "LOW" ? "plutôt faibles" : p.reservesLevel === "HIGH" ? "solides" : "dans la moyenne"}
                </Badge>
              </dd>
            </>
          )}
          {p.adminPerInsuredRp !== null && (
            <>
              <dt className="text-muted">Frais administratifs</dt>
              <dd className="text-right">
                <Chf rp={p.adminPerInsuredRp} whole /> par assuré et par an
                {p.adminLevel && <span className="text-muted"> ({LEVEL_WORD[p.adminLevel]})</span>}
              </dd>
            </>
          )}
          {trendText && (
            <>
              <dt className="text-muted">Primes</dt>
              <dd className="text-right">
                {trendText}{" "}
                {p.trendLevel !== "SIMILAR" && (
                  <Badge tone={p.trendLevel === "BETTER" ? "saving" : "increase"} className="text-xs">
                    {p.trendLevel === "BETTER" ? "hausses modérées" : "hausses fortes"}
                  </Badge>
                )}
              </dd>
            </>
          )}
        </dl>
      )}
      {p?.year && <p className="text-xs text-muted">Comptes {p.year} publiés par l&apos;OFSP ; primes du modèle standard dans votre région.</p>}
      {card?.website && (
        <a href={card.website} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-primary">
          Site de la caisse <ExternalLink aria-hidden className="size-4" />
        </a>
      )}
    </div>
  );
}
