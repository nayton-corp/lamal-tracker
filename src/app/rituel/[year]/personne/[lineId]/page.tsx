import { BadgeCheck, CircleAlert, Stethoscope } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { confirmLineageAction, decideAction, keepAction } from "@/app/actions/review";
import { compareForLine, type CompareView } from "@/application/compare";
import { insurerLabel } from "@/infrastructure/db/queries";
import { insurer, lamalPolicy, reviewLine } from "@/infrastructure/db/schema";
import { AGE_CLASS_LABEL, MODEL_LABEL, MODEL_TYPES, displayTariffLabel, type ModelType } from "@/domain/lamal";
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

type Search = { m?: string; f?: string; sort?: string; all?: string; n?: string };

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
  });
  const limit = sp.n === "all" ? view.offers.length : 30;

  return (
    <Page>
      <PageHeader
        title={view.personName}
        subtitle={`${AGE_CLASS_LABEL[line.targetAgeClass]} en ${year} · ${line.accident ? "avec" : "sans"} accident`}
        back={`/rituel/${year}#ligne-${lineId}`}
      />

      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Contrat actuel ({year - 1})</p>
            <p className="font-semibold">{insurerLabel(currentInsurer)}</p>
            <p className="text-sm text-muted">
              {displayTariffLabel(policy.tariffLabel, policy.modelType as ModelType)} · F {policy.franchiseChf}
            </p>
          </div>
          <p className="text-right">
            <Chf rp={policy.billedMonthlyRp} className="font-semibold" />
            <span className="block text-sm text-muted">/mois</span>
          </p>
        </div>
        <RenewalBlock view={view} year={year} lineId={lineId} modelType={policy.modelType as ModelType} />
      </Card>

      <Section title={`Offres ${year}`}>
        <FilterBar franchises={view.allowedFranchises} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>
            {view.offers.length} offre(s) sur {view.totalOffers} · frais attendus <Chf rp={view.healthCostsRp} whole />
          </span>
          <FranchiseSimulator lineId={lineId} franchises={view.curve.franchises} points={view.curve.points} breakEvenRp={view.curve.breakEvenRp} healthCostsRp={view.healthCostsRp} />
        </div>
        {view.offers.length === 0 ? (
          <Alert tone="info" title="Aucune offre avec ces filtres">
            Élargissez les modèles ou cochez « Ignorer les préférences » dans Filtres.
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
    </Page>
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
            {displayTariffLabel(o.tariffLabel, o.modelType)} · F {o.franchiseChf}
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
        {o.doctorCheck && <p className="text-muted">Modèle avec premier recours : vérifiez sur le site de la caisse que votre médecin figure dans la liste.</p>}
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
