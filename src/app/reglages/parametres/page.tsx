import type { Metadata } from "next";
import { saveParametersAction } from "@/app/actions";
import { reviewTargetYear } from "@/domain/deadlines";
import { app } from "@/server/app";
import { ActionForm, FormField, SubmitButton } from "@/ui/action-form";
import { Card, Input, Notice, PageHeader } from "@/ui/primitives";
import { href, one, type Search } from "@/ui/search-params";
import Link from "next/link";

export const metadata: Metadata = { title: "Paramètres LAMal" };

const rpToChf = (rp: number | null | undefined) => (rp === null || rp === undefined ? "" : (rp / 100).toFixed(2));

export default async function ParametersPage({ searchParams }: PageProps<"/reglages/parametres">) {
  const sp = (await searchParams) as Search;
  const ctx = app();
  const target = reviewTargetYear(ctx.clock.today());
  const year = Number(one(sp, "annee")) || target;
  const p = ctx.reference.parameters(year);
  const co2 = ctx.reference.co2(year);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Paramètres LAMal" back="/reglages" subtitle="Valeurs légales utilisées pour le calcul du coût total" />
      <div className="flex gap-2">
        {[target - 1, target, target + 1].map((y) => (
          <Link
            key={y}
            href={href("/reglages/parametres", sp, { annee: String(y) })}
            aria-current={y === year ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-semibold ${y === year ? "border-primary bg-primary-soft text-primary" : "border-border text-muted"}`}
          >
            {y}
          </Link>
        ))}
      </div>
      {p.isDefault && <Notice tone="info">Valeurs par défaut (droit en vigueur). Enregistre-les pour les figer pour {year}.</Notice>}
      <Card>
        <ActionForm action={saveParametersAction} key={year}>
          <input type="hidden" name="year" value={year} />
          <FormField name="franchisesAdult" label="Franchises adultes (CHF)">
            <Input id="franchisesAdult" name="franchisesAdult" defaultValue={p.franchisesAdult.join(", ")} />
          </FormField>
          <FormField name="franchisesKid" label="Franchises enfants (CHF)">
            <Input id="franchisesKid" name="franchisesKid" defaultValue={p.franchisesKid.join(", ")} />
          </FormField>
          <FormField name="coinsuranceRate" label="Quote-part (%)">
            <Input
              id="coinsuranceRate"
              name="coinsuranceRate"
              type="number"
              step="0.1"
              inputMode="decimal"
              defaultValue={p.coinsuranceRateBp / 100}
            />
          </FormField>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <FormField name="coinsuranceMaxAdult" label="Plafond adulte (CHF)">
              <Input id="coinsuranceMaxAdult" name="coinsuranceMaxAdult" inputMode="decimal" defaultValue={rpToChf(p.coinsuranceMaxAdultRp)} />
            </FormField>
            <FormField name="coinsuranceMaxKid" label="Plafond enfant (CHF)">
              <Input id="coinsuranceMaxKid" name="coinsuranceMaxKid" inputMode="decimal" defaultValue={rpToChf(p.coinsuranceMaxKidRp)} />
            </FormField>
          </div>
          <FormField
            name="co2Annual"
            label={`Redistribution CO2 ${year} par personne (CHF/an)`}
            hint="Montant déduit des primes par toutes les caisses (taxe CO2 et COV), publié par l'OFEV. Laisser vide si inconnu."
          >
            <Input id="co2Annual" name="co2Annual" inputMode="decimal" defaultValue={rpToChf(co2?.annualAmountRp)} />
          </FormField>
          <FormField name="co2Source" label="Source du montant CO2">
            <Input id="co2Source" name="co2Source" defaultValue={co2?.sourceNote ?? ""} placeholder="ex. communiqué OFEV" />
          </FormField>
          <SubmitButton>Enregistrer pour {year}</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
