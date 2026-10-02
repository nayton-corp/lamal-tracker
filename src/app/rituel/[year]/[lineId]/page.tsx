import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { confirmRenewalAction, keepCurrentAction, resetDecisionAction, setDoctorCheckAction } from "@/app/actions";
import { franchiseSimulation, offersForLine, reviewOverview } from "@/application/review";
import { AGE_CLASS_LABEL } from "@/domain/age-class";
import type { SortKey } from "@/domain/comparison/rank";
import { MATCH_CONFIDENCE_LABEL } from "@/domain/comparison/renewal";
import { MODEL_LABEL, MODEL_SHORT, MODEL_TYPES, requiresDoctorCheck, type ModelType } from "@/domain/insurance-model";
import { chfToRappen, formatChf } from "@/domain/money";
import { DECISION_LABEL } from "@/domain/review";
import { reviewForYear } from "@/server/review-lookup";
import { ActionForm, SubmitButton } from "@/ui/action-form";
import { Delta, Saving } from "@/ui/amount";
import { cn } from "@/ui/cn";
import { Badge, ButtonLink, Card, CardTitle, Notice, PageHeader } from "@/ui/primitives";
import { FranchiseSimulator } from "@/ui/ritual/franchise-simulator";
import { OfferCard } from "@/ui/ritual/offer-card";

import { href, list, one, toggle, type Search } from "@/ui/search-params";

export const metadata: Metadata = { title: "Comparer" };

const SORTS: { key: SortKey; label: string }[] = [
  { key: "expectedCost", label: "Coût total" },
  { key: "premium", label: "Prime" },
  { key: "worstCase", label: "Pire cas" },
];

export default async function LinePage({ params, searchParams }: PageProps<"/rituel/[year]/[lineId]">) {
  const { year, lineId } = await params;
  const sp = (await searchParams) as Search;
  const { ctx, review, household } = reviewForYear(year);
  const overview = reviewOverview(ctx, review.id);
  const lo = overview.lines.find((l) => l.line.id === Number(lineId));
  if (!lo) notFound();
  const base = `/rituel/${review.targetYear}/${lo.line.id}`;
  const locked = review.status === "CLOSED" || lo.letterId !== null;

  const sortBy = (one(sp, "tri") as SortKey) || "expectedCost";
  const models = list(sp, "modeles").filter((m): m is ModelType => (MODEL_TYPES as readonly string[]).includes(m));
  const franchises = list(sp, "franchises").map(Number).filter(Number.isFinite);
  const fraisParam = one(sp, "frais");
  let healthCostsRp: number | undefined;
  try {
    healthCostsRp = fraisParam ? chfToRappen(fraisParam) : undefined;
  } catch {
    healthCostsRp = undefined;
  }
  const limit = Math.min(Number(one(sp, "n") ?? 12) || 12, 200);
  const all = one(sp, "tous") === "1";
  const result = offersForLine(ctx, lo.line.id, {
    sortBy,
    models: models.length ? models : undefined,
    franchises: franchises.length ? franchises : undefined,
    healthCostsRp,
    onePerProduct: !all,
    limit,
  });
  const compared = list(sp, "cmp").slice(0, 3);
  const fullList = offersForLine(ctx, lo.line.id, { sortBy, healthCostsRp, onePerProduct: false });
  const comparedOffers = compared.map((id) => fullList.offers.find((o) => String(o.tariff.id) === id)).filter((o) => o !== undefined);
  // Économie de la décision figée, mesurée avec les frais attendus des préférences (comme au moment du choix).
  const prefsList = healthCostsRp === undefined ? fullList : offersForLine(ctx, lo.line.id, { onePerProduct: false });
  const renewalOffer = prefsList.offers.find((o) => o.tariff.id === lo.line.renewalTariffId);
  const chosenSaving = renewalOffer && lo.line.chosenAnnualCostRp !== null ? renewalOffer.cost.totalRp - lo.line.chosenAnnualCostRp : null;
  const simId = Number(one(sp, "sim") ?? lo.line.chosenTariffId ?? lo.line.renewalTariffId ?? result.offers[0]?.tariff.id ?? 0);
  const sim = simId ? franchiseSimulation(ctx, lo.line.id, simId, result.criteria.healthCostsRp) : null;

  // Candidats de renouvellement chez la caisse actuelle (confirmation manuelle).
  const needsRenewalChoice = lo.current && (lo.line.renewalConfidence === "NONE" || lo.line.renewalConfidence === "PROBABLE");
  const renewalCandidates = needsRenewalChoice
    ? ctx.tariffs
        .tariffs({
          datasetId: review.datasetId,
          canton: household.canton,
          region: household.region,
          ageClass: lo.ageClass,
          accidentIncluded: lo.current!.accidentIncluded,
          insurerId: lo.current!.insurerId,
        })
        .filter((t) => t.franchiseChf === (lo.line.renewalFranchiseChf ?? lo.current!.franchiseChf) && t.ageSubgroup === result.criteria.ageSubgroup)
        .sort((a, b) => a.tariffLabel.localeCompare(b.tariffLabel, "fr"))
    : [];

  const legal = result.legalFranchises;

  return (
    <div className="flex flex-col gap-4 pb-24">
      <PageHeader
        title={lo.person.firstName}
        subtitle={`${AGE_CLASS_LABEL[lo.ageClass]} en ${review.targetYear}`}
        back={`/rituel/${review.targetYear}`}
      />
      {lo.ageClassWarning && <Notice tone="up">{lo.ageClassWarning}</Notice>}

      <Card>
        <CardTitle>Contrat actuel et renouvellement</CardTitle>
        {lo.current ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">{lo.current.coverageYear}</p>
                <p className="num text-lg font-bold">{formatChf(lo.current.billedMonthlyRp)}</p>
                <p className="text-xs text-muted">
                  {lo.current.insurerName} · {MODEL_SHORT[lo.current.modelType as ModelType]} · {lo.current.franchiseChf}
                </p>
              </div>
              <span aria-hidden className="text-muted">
                →
              </span>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">{review.targetYear}</p>
                <p className="num text-lg font-bold">{lo.renewal ? formatChf(lo.renewal.monthlyPremiumRp) : "?"}</p>
                <p className="text-xs text-muted">{lo.renewal ? `${lo.renewal.tariffLabel} · ${lo.renewal.franchiseChf}` : "Renouvellement inconnu"}</p>
              </div>
            </div>
            {lo.change && (
              <p className="text-base">
                <Delta rp={lo.change.deltaMonthlyRp} bp={lo.change.changeBp} suffix="/mois" />{" "}
                <span className="num text-sm text-muted">soit {formatChf(lo.change.deltaAnnualRp, { signed: true })} par an</span>
              </p>
            )}
            {lo.market && (
              <p className="text-sm text-muted">
                Rang {lo.market.rank} sur {lo.market.total} offres de ta région à cette franchise (médiane {formatChf(lo.market.medianRp)}, la moins
                chère {formatChf(lo.market.minRp)}).
              </p>
            )}
            <Badge tone={lo.line.renewalConfidence === "EXACT" || lo.line.renewalConfidence === "LINEAGE" || lo.line.renewalConfidence === "MANUAL" ? "down" : "up"} className="self-start">
              {lo.line.renewalConfidence === "MANUAL" ? "Renouvellement confirmé" : MATCH_CONFIDENCE_LABEL[lo.line.renewalConfidence]}
            </Badge>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Aucun contrat {review.targetYear - 1} : la hausse ne peut pas être calculée.</p>
            <ButtonLink href={`/foyer/${lo.person.id}/contrat?annee=${review.targetYear - 1}`} variant="secondary">
              Saisir le contrat {review.targetYear - 1}
            </ButtonLink>
          </div>
        )}
        {needsRenewalChoice && renewalCandidates.length > 0 && !locked && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-sm font-semibold">Quel est ton produit en {review.targetYear} ?</p>
            <p className="mb-2 text-xs text-muted">
              L&apos;OFSP ne relie pas les produits d&apos;une année à l&apos;autre. Choisis celui qui correspond à ton contrat ; ce lien sera retenu.
            </p>
            <ul className="flex flex-col gap-2">
              {renewalCandidates.map((t) => (
                <li key={t.id}>
                  <ActionForm action={confirmRenewalAction} className="gap-1" showSuccess={false}>
                    <input type="hidden" name="lineId" value={lo.line.id} />
                    <input type="hidden" name="tariffId" value={t.id} />
                    <button
                      type="submit"
                      className={cn(
                        "flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm",
                        t.id === lo.line.renewalTariffId ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-2",
                      )}
                    >
                      <span>
                        {t.tariffLabel} <span className="text-muted">· {MODEL_SHORT[t.modelType]}</span>
                      </span>
                      <span className="num font-semibold">{formatChf(t.monthlyPremiumRp)}</span>
                    </button>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {lo.activeLca.length > 0 && (
        <Notice tone="lca" title={`${lo.activeLca.length} complémentaire(s) LCA chez ${lo.current?.insurerName}`}>
          Elles restent actives si tu changes d&apos;assurance de base. Le garde-fou te le rappellera avant toute lettre.
        </Notice>
      )}

      <section aria-labelledby="offers-title" className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <h2 id="offers-title" className="text-lg font-bold">
            Offres {review.targetYear}
          </h2>
          <p className="text-xs text-muted">{result.total} {all ? "tarifs" : "produits"}</p>
        </div>
        <nav aria-label="Tri" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={href(base, sp, { tri: s.key === "expectedCost" ? null : s.key, n: null })}
              scroll={false}
              aria-current={sortBy === s.key ? "true" : undefined}
              className={cn("flex min-h-10 flex-1 items-center justify-center rounded-lg text-sm font-semibold", sortBy === s.key ? "bg-surface shadow-card" : "text-muted")}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrer par modèle">
          {MODEL_TYPES.map((m) => {
            const active = models.includes(m);
            return (
              <Link
                key={m}
                href={href(base, sp, { modeles: toggle(models, m), n: null })}
                scroll={false}
                aria-pressed={active}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center rounded-full border px-3 text-sm",
                  active ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-surface",
                )}
              >
                {MODEL_SHORT[m]}
              </Link>
            );
          })}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrer par franchise">
          {legal.map((f) => {
            const active = franchises.includes(f);
            return (
              <Link
                key={f}
                href={href(base, sp, { franchises: toggle(franchises.map(String), String(f)), n: null })}
                scroll={false}
                aria-pressed={active}
                className={cn(
                  "num inline-flex min-h-10 shrink-0 items-center rounded-full border px-3 text-sm",
                  active ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border bg-surface",
                )}
              >
                {f}
              </Link>
            );
          })}
          <Link
            href={href(base, sp, { tous: all ? null : "1", n: null })}
            scroll={false}
            className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-dashed border-border px-3 text-sm text-muted"
          >
            {all ? "1 carte par produit" : "Toutes les franchises"}
          </Link>
        </div>
        <form className="flex items-end gap-2" action={base}>
          {Object.entries(sp).map(([k, v]) =>
            k === "frais" || k === "n" || !v ? null : <input key={k} type="hidden" name={k} value={Array.isArray(v) ? v[0] : v} />,
          )}
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium">Frais de santé attendus (CHF/an)</span>
            <input
              name="frais"
              inputMode="decimal"
              defaultValue={(result.criteria.healthCostsRp / 100).toFixed(0)}
              className="min-h-11 w-full rounded-xl border border-border bg-surface px-3"
            />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold">
            Recalculer
          </button>
        </form>

        {comparedOffers.length >= 2 && (
          <Card className="overflow-x-auto p-3">
            <CardTitle className="mb-2" action={<Link href={href(base, sp, { cmp: null })} scroll={false} className="text-sm text-primary">Effacer</Link>}>
              Côte à côte
            </CardTitle>
            <table className="num w-full min-w-[20rem] text-sm">
              <thead>
                <tr>
                  <th className="sr-only">Critère</th>
                  {comparedOffers.map((o) => (
                    <th key={o!.tariff.id} className="px-1 pb-2 text-left align-bottom font-semibold">
                      {o!.tariff.insurerName}
                      <span className="block text-xs font-normal text-muted">{o!.tariff.tariffLabel}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Modèle", (o: (typeof comparedOffers)[number]) => MODEL_SHORT[o!.tariff.modelType]],
                  ["Franchise", (o: (typeof comparedOffers)[number]) => String(o!.tariff.franchiseChf)],
                  ["Prime/mois", (o: (typeof comparedOffers)[number]) => formatChf(o!.tariff.monthlyPremiumRp)],
                  ["Prime nette/an", (o: (typeof comparedOffers)[number]) => formatChf(o!.cost.netPremiumsRp, { compact: true })],
                  ["Participation", (o: (typeof comparedOffers)[number]) => formatChf(o!.cost.costSharingRp, { compact: true })],
                  ["Coût total/an", (o: (typeof comparedOffers)[number]) => formatChf(o!.cost.totalRp, { compact: true })],
                  ["Pire cas/an", (o: (typeof comparedOffers)[number]) => formatChf(o!.worstCaseRp, { compact: true })],
                ].map(([label, fn]) => (
                  <tr key={label as string} className="border-t border-border">
                    <th scope="row" className="py-1.5 pr-2 text-left text-xs font-medium text-muted">
                      {label as string}
                    </th>
                    {comparedOffers.map((o) => (
                      <td key={o!.tariff.id} className="px-1 py-1.5">
                        {(fn as (x: typeof o) => string)(o)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {result.offers.length === 0 ? (
          <Notice>Aucune offre ne correspond à ces filtres.</Notice>
        ) : (
          <ol className="flex flex-col gap-3">
            {result.offers.map((o, i) => (
              <li key={o.tariff.id}>
                <OfferCard
                  offer={o}
                  lineId={lo.line.id}
                  highlight={i < 3}
                  isRenewal={o.tariff.id === lo.line.renewalTariffId}
                  isChosen={o.tariff.id === lo.line.chosenTariffId}
                  simulateHref={`${href(base, sp, { sim: String(o.tariff.id) })}#simulateur`}
                  compareHref={href(base, sp, { cmp: toggle(compared, String(o.tariff.id)).split(",").slice(-3).join(",") })}
                  compared={compared.includes(String(o.tariff.id))}
                  reasons={o.reasons}
                  locked={locked}
                />
              </li>
            ))}
          </ol>
        )}
        {result.total > result.offers.length && (
          <ButtonLink href={href(base, sp, { n: String(limit + 12) })} scroll={false} variant="secondary">
            Voir plus d&apos;offres ({result.total - result.offers.length} restantes)
          </ButtonLink>
        )}
      </section>

      {sim && (
        <Card id="simulateur">
          <CardTitle>Simulateur de franchise</CardTitle>
          <FranchiseSimulator
            title={`${sim.tariff.insurerName} · ${sim.tariff.tariffLabel}`}
            options={sim.options.map((o) => ({ franchiseChf: o.franchiseChf, monthlyPremiumRp: o.monthlyPremiumRp }))}
            params={result.params}
            ageClass={lo.ageClass}
            initialHealthCostsRp={result.criteria.healthCostsRp}
            co2AnnualRp={review.co2AnnualRp}
          />
        </Card>
      )}

      {lo.line.chosenModelType && requiresDoctorCheck(lo.line.chosenModelType as ModelType) && (
        <Card>
          <CardTitle>Médecin traitant</CardTitle>
          <p className="mb-3 text-sm text-muted">
            Le modèle {MODEL_LABEL[lo.line.chosenModelType as ModelType].toLowerCase()} impose de passer par un médecin ou un centre de la liste
            de l&apos;assureur. Vérifie sur le site de la caisse que {ctx.household.prefs(lo.person.id).doctorName || "ton médecin"} y figure.
          </p>
          <div className="flex gap-2">
            {(["YES", "NO", "UNKNOWN"] as const).map((v) => (
              <form key={v} action={setDoctorCheckAction} className="flex-1">
                <input type="hidden" name="lineId" value={lo.line.id} />
                <input type="hidden" name="value" value={v} />
                <button
                  type="submit"
                  aria-pressed={lo.line.doctorCheck === v}
                  className={cn(
                    "min-h-11 w-full rounded-xl border text-sm font-semibold",
                    lo.line.doctorCheck === v ? "border-primary bg-primary-soft text-primary" : "border-border",
                  )}
                >
                  {v === "YES" ? "Il y figure" : v === "NO" ? "Non" : "À vérifier"}
                </button>
              </form>
            ))}
          </div>
        </Card>
      )}

      {/* Barre de décision fixe, dans la zone du pouce */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2.5">
          {lo.line.decision ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{DECISION_LABEL[lo.line.decision]}</p>
                <p className="truncate text-xs text-muted">
                  {lo.line.chosenLabel} · {formatChf(lo.line.chosenMonthlyRp ?? 0)}/mois
                </p>
                {chosenSaving !== null && chosenSaving !== 0 && <Saving rp={chosenSaving} className="text-xs" />}
              </div>
              {lo.line.decision === "SWITCH" && !lo.line.lcaAckAt && !locked ? (
                <ButtonLink href={`${base}/lca`} variant="lca" className="shrink-0">
                  Garde-fou LCA
                </ButtonLink>
              ) : lo.line.decision === "SWITCH" ? (
                <ButtonLink href={`/rituel/${review.targetYear}/lettres`} className="shrink-0">
                  Lettre
                </ButtonLink>
              ) : null}
              {!locked && (
                <ActionForm action={resetDecisionAction} className="shrink-0 gap-0" showSuccess={false}>
                  <input type="hidden" name="lineId" value={lo.line.id} />
                  <SubmitButton variant="ghost" className="min-h-11 px-3 text-sm">
                    Modifier
                  </SubmitButton>
                </ActionForm>
              )}
            </>
          ) : lo.line.renewalTariffId && !locked ? (
            <>
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">Choisis une offre</span>
                <span className="block text-xs text-muted">ou garde ton contrat au tarif {review.targetYear}</span>
              </p>
              <ActionForm action={keepCurrentAction} className="shrink-0 gap-0" showSuccess={false}>
                <input type="hidden" name="lineId" value={lo.line.id} />
                <SubmitButton variant="secondary">Je reste</SubmitButton>
              </ActionForm>
            </>
          ) : (
            <p className="text-sm text-muted">Choisis une offre dans la liste.</p>
          )}
        </div>
      </div>
    </div>
  );
}
