import type { Metadata } from "next";
import { CANTONS } from "@/domain/tariff";
import { app } from "@/server/app";
import { HouseholdForm } from "@/ui/forms/household-forms";
import { Card, PageHeader } from "@/ui/primitives";

export const metadata: Metadata = { title: "Modifier le foyer" };

export default function EditHouseholdPage() {
  const ctx = app();
  const h = ctx.household.household();
  const persons = h ? ctx.household.persons(h.id).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` })) : [];
  const latest = ctx.tariffs.activeYears().at(-1);
  const ds = latest ? ctx.tariffs.activeDataset(latest) : undefined;
  const regionsByCanton: Record<string, number[]> = ds ? Object.fromEntries(CANTONS.map((c) => [c, ctx.tariffs.regions(ds.id, c)])) : {};
  return (
    <>
      <PageHeader title={h ? "Modifier le foyer" : "Configurer le foyer"} back="/foyer" />
      <Card>
        <HouseholdForm values={h ?? null} persons={persons} regionsByCanton={regionsByCanton} />
      </Card>
    </>
  );
}
