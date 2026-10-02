import { BadgeCheck, Check, CircleAlert, ShieldCheck, Stethoscope, TrendingDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { confirmLineageAction, decideAction, keepAction } from "@/app/actions/review";
import { compareForLine, offerKey, type CompareView, type DetailedOffer } from "@/application/compare";
import { insurerLabel } from "@/infrastructure/db/queries";
import { insurer, lamalPolicy, person, reviewLine } from "@/infrastructure/db/schema";
import { STRATEGY_INFO } from "@/domain/strategy";
import { AGE_CLASS_LABEL, MODEL_LABEL, MODEL_TYPES, displayTariffLabel, type ModelType } from "@/domain/lamal";
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
import { CompareBar, CompareToggle } from "./compare-select";
import { FilterBar } from "./filter-bar";
import { InsurerFacts, ModelBlock, OfferCosts } from "./offer-details";
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

  // Sans paramètre, les besoins de la personne s'appliquent ; « all » lève le filtre.
  const models = sp.m === undefined ? undefined : sp.m.split(",").filter((m): m is ModelType => (MODEL_TYPES as readonly string[]).includes(m));
  const view = compareForLine(db(), lineId, {
    models,
    franchises: sp.f === undefined ? undefined : sp.f === "all" ? [] : [Number(sp.f)],
    sort: sp.sort === "premium" || sp.sort === "total" || sp.sort === "strategy" ? sp.sort : undefined,
    all: sp.all === "1",
    everyOffer: sp.every === "1",
  });
  const every = sp.every === "1";
  const limit = sp.n === "all" ? view.offers.length : 30;
  const members = db()
    .select({ id: reviewLine.id, decision: reviewLine.decision, firstName: person.firstName })
    .from(reviewLine)
    .innerJoin(person, eq(person.id, reviewLine.personId))
    .where(eq(reviewLine.reviewId, line.reviewId))
    .orderBy(asc(reviewLine.id))
    .all();
  const strategyLabel = view.strategy ? STRATEGY_INFO[view.strategy].label : null;
  const top = view.offers.slice(0, 3);
  const rest = view.offers.slice(3, limit);

  return (
    <Page wide>
      <PageHeader
        title={view.personName}
        subtitle={`${AGE_CLASS_LABEL[line.targetAgeClass]} en ${year} · ${line.accident ? "avec" : "sans"} accident`}
        back={`/rituel/${year}#ligne-${lineId}`}
      />
      {members.length > 1 && (
        <nav aria-label="Personnes du foyer" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          {members.map((m) => (
            <Link
              key={m.id}
              href={`/rituel/${year}/personne/${m.id}`}
              aria-current={m.id === lineId ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
                m.id === lineId ? "border-primary bg-primary text-on-primary" : "border-border bg-surface hover:bg-surface-2",
              )}
            >
              {m.decision !== "UNDECIDED" && <Check aria-label="choix fait" className="size-4" />}
              {m.firstName}
            </Link>
          ))}
        </nav>
      )}

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
        <FilterBar franchises={view.allowedFranchises} activeFranchise={view.effective.franchiseChf} activeModels={view.effective.models} sort={view.sort} strategyLabel={strategyLabel} />
        <p className="text-sm text-muted">
          Le coût total compte la prime et ce que vous paieriez de votre poche (franchise, 10 % de quote-part) pour des frais de santé de{" "}
          <Chf rp={view.healthCostsRp} whole /> par an.
        </p>
        <FranchiseSimulator lineId={lineId} franchises={view.curve.franchises} points={view.curve.points} breakEvenRp={view.curve.breakEvenRp} healthCostsRp={view.healthCostsRp} />
      </Section>
      </aside>

      <div className="space-y-6">
      <Section title={view.sort === "strategy" && strategyLabel ? `Top ${top.length} · ${strategyLabel}` : `Top ${top.length} en ${year}`}>
        <BestSummary view={view} every={every} />
        {view.offers.length === 0 ? (
          <Alert tone="info" title="Aucune offre avec ces filtres">
            Choisissez « Toutes franchises » ou d&apos;autres modèles d&apos;assurance.
          </Alert>
        ) : (
          <ol className="space-y-2">
            {top.map((o) => (
              <li key={`${o.tariffId}-${o.franchiseChf}`}>
                <OfferCard offer={o} view={view} year={year} lineId={lineId} />
              </li>
            ))}
          </ol>
        )}
        <Picks view={view} />
      </Section>
      {rest.length > 0 && (
      <Section title={every ? `Toutes les offres (${view.offers.length})` : `Les autres caisses (${view.offers.length - top.length})`}>
        <ol className="space-y-2">
          {rest.map((o) => (
            <li key={`${o.tariffId}-${o.franchiseChf}`}>
              <OfferCard offer={o} view={view} year={year} lineId={lineId} />
            </li>
          ))}
        </ol>
        {view.offers.length > limit && (
          <Button asChild variant="secondary" block>
            <Link href={`?${new URLSearchParams({ ...sp, n: "all" } as Record<string, string>).toString()}`} scroll={false}>
              Afficher les {view.offers.length - limit} autres offres
            </Link>
          </Button>
        )}
      </Section>
      )}
      <CompareBar />
      </div>
      </div>
    </Page>
  );
}

/** La meilleure offre selon chacune des trois stratégies, pour voir ce qu'on gagne ou perd. */
function Picks({ view }: { view: CompareView }) {
  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium">Selon chaque stratégie</p>
      <ul className="divide-y divide-border text-sm">
        {view.picks.map(({ strategy, offer }) => (
          <li key={strategy} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className={cn("block font-medium", strategy === view.strategy && "text-primary")}>
                {STRATEGY_INFO[strategy].label}
                {strategy === view.strategy && " (la vôtre)"}
              </span>
              <span className="block text-muted">
                {offer ? `${offer.insurerName} · ${MODEL_LABEL[offer.modelType]} · franchise ${offer.franchiseChf}` : "aucune offre"}
              </span>
            </span>
            {offer && <Saving rp={offer.savingsRp} className="shrink-0" />}
          </li>
        ))}
      </ul>
    </Card>
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

function OfferCard({ offer: o, view, year, lineId }: { offer: DetailedOffer; view: CompareView; year: number; lineId: number }) {
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
            {(view.quality[o.insurerId] ?? 0) >= 2 && (
              <Badge tone="saving" className="text-xs">
                <ShieldCheck aria-hidden className="size-3" /> Caisse solide
              </Badge>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <Chf rp={o.monthlyPremiumRp} className="block font-semibold" />
          <Saving rp={o.savingsRp} className="block text-sm" />
        </span>
      </summary>
      <div className="space-y-4 border-t border-border p-3 text-sm">
        <OfferCosts offer={o} healthCostsRp={view.healthCostsRp} />
        <ModelBlock offer={o} />
        <InsurerFacts name={o.insurerName} card={view.insurers[o.insurerId]} />
        <div className="space-y-1">
          <p className="font-medium">Avant de choisir</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            {o.doctorCheck && <li>Vérifiez sur le site de la caisse que votre médecin figure dans la liste du modèle.</li>}
            <li>Lisez le règlement du modèle (conditions particulières) sur le site de la caisse.</li>
            <li>Les complémentaires (hospitalisation, dentaire…) n&apos;ont pas de tarif public : elles se demandent avec la demande d&apos;offre, après votre choix.</li>
          </ul>
        </div>
        <CompareToggle k={offerKey(o)} name={`${o.insurerName}, ${displayTariffLabel(o.tariffLabel, o.modelType)}, franchise ${o.franchiseChf}`} />
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

