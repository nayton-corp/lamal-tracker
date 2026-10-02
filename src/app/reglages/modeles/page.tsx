import type { Metadata } from "next";
import Link from "next/link";
import { setModelOverrideAction } from "@/app/actions";
import { MODEL_LABEL, MODEL_TYPES } from "@/domain/insurance-model";
import { app } from "@/server/app";
import { Badge, Button, Card, EmptyState, PageHeader, Select } from "@/ui/primitives";
import { href, one, type Search } from "@/ui/search-params";

export const metadata: Metadata = { title: "Modèles d'assurance" };

export default async function ModelsPage({ searchParams }: PageProps<"/reglages/modeles">) {
  const sp = (await searchParams) as Search;
  const ctx = app();
  const h = ctx.household.household();
  const year = ctx.tariffs.activeYears().sort((a, b) => b - a)[0];
  const dataset = year ? ctx.tariffs.activeDataset(year) : undefined;
  if (!h || !dataset) {
    return (
      <>
        <PageHeader title="Modèles d'assurance" back="/reglages" />
        <EmptyState title="Rien à classer">Configure le foyer et active des primes pour voir les produits de ta région.</EmptyState>
      </>
    );
  }
  const all = one(sp, "tous") === "1";
  const q = (one(sp, "q") ?? "").toLowerCase();
  const products = ctx.tariffs
    .products(dataset.id, h.canton, h.region)
    .filter((p) => all || p.modelType === "OTHER" || p.overridden)
    .filter((p) => !q || `${p.insurerName} ${p.tariffLabel} ${p.tariffCode}`.toLowerCase().includes(q));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Modèles d'assurance"
        back="/reglages"
        subtitle={`Produits ${year} · ${h.canton}, région ${h.region}. Le modèle est déduit du type OFSP et du nom du produit.`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={href("/reglages/modeles", sp, { tous: all ? null : "1" })}
          className="inline-flex min-h-10 items-center rounded-full border border-border px-3 text-sm font-semibold text-muted"
        >
          {all ? "Afficher seulement « Autre » et corrigés" : "Afficher tous les produits"}
        </Link>
        <form action="/reglages/modeles" className="flex flex-1 gap-2">
          {all && <input type="hidden" name="tous" value="1" />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher…"
            aria-label="Rechercher un produit"
            className="min-h-10 min-w-0 flex-1 rounded-full border border-border bg-surface px-3 text-sm"
          />
        </form>
      </div>
      {products.length === 0 ? (
        <EmptyState title="Aucun produit à corriger">Tous les produits ont un modèle reconnu.</EmptyState>
      ) : (
        <Card className="py-1">
          <ul>
            {products.map((p) => (
              <li key={`${p.insurerId}-${p.tariffCode}`} className="border-b border-border py-3 last:border-b-0">
                <p className="truncate font-semibold">{p.insurerName}</p>
                <p className="truncate text-sm text-muted">
                  {p.tariffLabel} · {p.tariffCode}
                  {p.rawType ? ` · ${p.rawType}` : ""}
                </p>
                <form action={setModelOverrideAction} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="insurerId" value={p.insurerId} />
                  <input type="hidden" name="tariffCode" value={p.tariffCode} />
                  <Select name="modelType" defaultValue={p.modelType} aria-label="Modèle" className="min-h-10 flex-1 text-sm">
                    {MODEL_TYPES.map((m) => (
                      <option key={m} value={m}>
                        {MODEL_LABEL[m]}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" className="min-h-10 px-3 text-sm">
                    OK
                  </Button>
                  {p.overridden ? <Badge tone="info">corrigé</Badge> : null}
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
