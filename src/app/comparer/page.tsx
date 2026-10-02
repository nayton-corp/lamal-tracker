import type { Metadata } from "next";
import Link from "next/link";
import { freeComparison } from "@/application/compare";
import { AGE_CLASS_LABEL, AGE_CLASSES, type AgeClass } from "@/domain/age-class";
import type { SortKey } from "@/domain/comparison/rank";
import { MODEL_LABEL, MODEL_SHORT, MODEL_TYPES, type ModelType } from "@/domain/insurance-model";
import { formatChf } from "@/domain/money";
import { app } from "@/server/app";
import { Chf } from "@/ui/amount";
import { cn } from "@/ui/cn";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/ui/primitives";
import { href, list, one, toggle, type Search } from "@/ui/search-params";

export const metadata: Metadata = { title: "Comparer" };

const SORTS: { key: SortKey; label: string }[] = [
  { key: "expectedCost", label: "Coût total" },
  { key: "premium", label: "Prime" },
  { key: "worstCase", label: "Pire cas" },
];

function Chip({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      scroll={false}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center rounded-full border px-3 text-sm font-semibold",
        active ? "border-primary bg-primary-soft text-primary" : "border-border text-muted",
      )}
    >
      {children}
    </Link>
  );
}

export default async function ComparePage({ searchParams }: PageProps<"/comparer">) {
  const sp = (await searchParams) as Search;
  const ctx = app();
  const personParam = one(sp, "personne");
  const classParam = one(sp, "classe");
  const r = freeComparison(ctx, {
    year: Number(one(sp, "annee")) || undefined,
    personId: personParam ? Number(personParam) : undefined,
    ageClass: (AGE_CLASSES as readonly string[]).includes(classParam ?? "") ? (classParam as AgeClass) : undefined,
    accidentIncluded: one(sp, "accident") === undefined ? undefined : one(sp, "accident") === "1",
    franchiseChf: one(sp, "franchise") ? Number(one(sp, "franchise")) : undefined,
    models: list(sp, "modeles").filter((m): m is ModelType => (MODEL_TYPES as readonly string[]).includes(m)),
    healthCostsRp: one(sp, "frais") ? Math.max(0, Number(one(sp, "frais"))) * 100 : undefined,
    sortBy: (SORTS.find((s) => s.key === one(sp, "tri"))?.key ?? "expectedCost") as SortKey,
    limit: Number(one(sp, "n")) || 30,
  });

  if (r.status === "unavailable") {
    return (
      <>
        <PageHeader title="Comparer" />
        {!r.household ? (
          <EmptyState title="Configure d'abord le foyer" action={<ButtonLink href="/foyer/edition">Configurer</ButtonLink>}>
            Le comparateur utilise ton canton et ta région de primes.
          </EmptyState>
        ) : (
          <EmptyState title="Aucune prime importée" action={<ButtonLink href="/reglages/primes">Importer les primes</ButtonLink>}>
            Importe le fichier officiel de l&apos;OFSP pour comparer les offres.
          </EmptyState>
        )}
      </>
    );
  }

  const persons = ctx.household.persons(r.household.id);
  const base = "/comparer";
  const models = list(sp, "modeles");
  const reset = { personne: null, classe: null, franchise: null, modeles: null, accident: null, n: null };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Comparer"
        subtitle={`Primes ${r.year} · ${r.household.canton}, région ${r.household.region}`}
      />

      <Card className="flex flex-col gap-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {persons.map((p) => (
            <Chip key={p.id} to={href(base, sp, { ...reset, personne: String(p.id) })} active={r.person?.id === p.id}>
              {p.firstName}
            </Chip>
          ))}
          {AGE_CLASSES.map((c) => (
            <Chip key={c} to={href(base, sp, { ...reset, classe: c })} active={!r.person && r.ageClass === c}>
              {AGE_CLASS_LABEL[c]}
            </Chip>
          ))}
        </div>
        {r.years.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {r.years.map((y) => (
              <Chip key={y} to={href(base, sp, { annee: String(y) })} active={r.year === y}>
                {y}
              </Chip>
            ))}
          </div>
        )}
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Franchise</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            <Chip to={href(base, sp, { franchise: null })} active={r.franchise === null}>
              Toutes
            </Chip>
            {r.legal.map((f) => (
              <Chip key={f} to={href(base, sp, { franchise: String(f) })} active={r.franchise === f}>
                {f}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Modèle</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {MODEL_TYPES.filter((m) => m !== "OTHER").map((m) => (
              <Chip key={m} to={href(base, sp, { modeles: toggle(models, m) })} active={models.includes(m)}>
                {MODEL_SHORT[m]}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip to={href(base, sp, { accident: r.accident ? "0" : "1" })} active={r.accident}>
            {r.accident ? "✓ Avec accident" : "Sans accident"}
          </Chip>
          {SORTS.map((s) => (
            <Chip key={s.key} to={href(base, sp, { tri: s.key === "expectedCost" ? null : s.key })} active={r.criteria.sortBy === s.key}>
              Tri : {s.label}
            </Chip>
          ))}
        </div>
        <form action={base} className="flex items-end gap-2">
          {Object.entries(sp).map(([k, v]) =>
            k === "frais" || typeof v !== "string" ? null : <input key={k} type="hidden" name={k} value={v} />,
          )}
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
            Frais de santé attendus (CHF/an)
            <input
              name="frais"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              defaultValue={Math.round(r.criteria.healthCostsRp / 100)}
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base"
            />
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold">
            Appliquer
          </button>
        </form>
      </Card>

      {r.market && (
        <p className="text-sm text-muted">
          Marché franchise {r.franchise} : de <Chf rp={r.market.minRp} /> à <Chf rp={r.market.maxRp} />, médiane <Chf rp={r.market.medianRp} /> par mois.
        </p>
      )}

      <p className="text-sm text-muted">
        {r.total} produit{r.total > 1 ? "s" : ""} · meilleure franchise par produit pour {formatChf(r.criteria.healthCostsRp, { compact: true })} de frais par an
        {r.criteria.co2AnnualRp ? `, redistribution CO2 de ${formatChf(r.criteria.co2AnnualRp, { compact: true })} déduite` : ""}.
      </p>

      {r.offers.length === 0 ? (
        <EmptyState title="Aucune offre pour ces filtres">Élargis les modèles ou la franchise.</EmptyState>
      ) : (
        <ol className="flex flex-col gap-3">
          {r.offers.map((o) => (
            <li key={o.tariff.id}>
              <article className="rounded-2xl border border-border bg-surface p-4 shadow-card" aria-label={`${o.tariff.insurerName}, ${o.tariff.tariffLabel}`}>
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "num inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      o.rank === 1 ? "bg-down-soft text-down" : "bg-surface-2 text-muted",
                    )}
                  >
                    {o.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{o.tariff.insurerName}</p>
                    <p className="truncate text-sm text-muted">{o.tariff.tariffLabel}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone="info">{MODEL_LABEL[o.tariff.modelType]}</Badge>
                      <Badge>Franchise {o.tariff.franchiseChf}</Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="num text-lg font-extrabold">{formatChf(o.tariff.monthlyPremiumRp)}</p>
                    <p className="text-xs text-muted">par mois</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-2.5 text-sm">
                  <div>
                    <p className="text-xs text-muted">Coût total estimé</p>
                    <p className="num font-semibold">{formatChf(o.cost.totalRp, { compact: true })}/an</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Pire cas</p>
                    <p className="num font-semibold">{formatChf(o.worstCaseRp, { compact: true })}/an</p>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
      {r.total > r.offers.length && (
        <ButtonLink variant="secondary" href={href(base, sp, { n: String(r.offers.length + 30) })} scroll={false}>
          Voir plus d&apos;offres
        </ButtonLink>
      )}
      <p className="text-xs text-muted">
        Pour changer de caisse, passe par le rituel d&apos;automne : il gère le garde-fou LCA et la lettre de résiliation.
      </p>
    </div>
  );
}
