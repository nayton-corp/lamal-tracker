import type { Metadata } from "next";
import { AGE_CLASS_LABEL, ageClassFor, ageInYear } from "@/domain/age-class";
import { reviewTargetYear } from "@/domain/deadlines";
import { MODEL_SHORT, type ModelType } from "@/domain/insurance-model";
import { app } from "@/server/app";
import { Chf } from "@/ui/amount";
import { Badge, ButtonLink, Card, CardTitle, EmptyState, ListRow, PageHeader } from "@/ui/primitives";

export const metadata: Metadata = { title: "Foyer" };

export default function HouseholdPage() {
  const ctx = app();
  const h = ctx.household.household();
  if (!h) {
    return (
      <>
        <PageHeader title="Foyer" />
        <EmptyState title="Aucun foyer configuré" action={<ButtonLink href="/foyer/edition">Configurer le foyer</ButtonLink>}>
          Indique ton adresse, ton canton et ta région de primes.
        </EmptyState>
      </>
    );
  }
  const today = ctx.clock.today();
  const year = Number(today.slice(0, 4));
  const nextYear = reviewTargetYear(today);
  const persons = ctx.household.persons(h.id);
  const lca = ctx.household.lcaPolicies(h.id);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Foyer" subtitle={`${h.name} · ${h.canton}, région ${h.region}`} />
      <Card>
        <CardTitle action={<ButtonLink href="/foyer/edition" variant="ghost" className="min-h-10 px-3 text-sm">Modifier</ButtonLink>}>
          Adresse
        </CardTitle>
        <p className="text-sm">
          {h.street || <span className="text-muted">Rue non renseignée</span>}
          <br />
          {h.npa} {h.locality}
        </p>
      </Card>
      <Card>
        <CardTitle action={<ButtonLink href="/foyer/personne/nouvelle" variant="ghost" className="min-h-10 px-3 text-sm">+ Ajouter</ButtonLink>}>
          Personnes
        </CardTitle>
        {persons.length === 0 ? (
          <p className="text-sm text-muted">Ajoute chaque membre du foyer assuré en Suisse.</p>
        ) : (
          <ul>
            {persons.map((p) => {
              const policy = ctx.household.policyFor(p.id, year) ?? ctx.household.latestPolicyBefore(p.id, year + 1);
              const cls = ageClassFor(p.birthDate, year);
              const next = ageClassFor(p.birthDate, nextYear);
              const lcaCount = lca.filter((l) => l.personId === p.id && l.status === "ACTIVE").length;
              return (
                <ListRow key={p.id} href={`/foyer/${p.id}`} trailing={policy ? <Chf rp={policy.billedMonthlyRp} className="text-sm font-semibold" /> : <Badge>Contrat ?</Badge>}>
                  <p className="font-semibold">
                    {p.firstName} {p.lastName}
                  </p>
                  <p className="text-xs text-muted">
                    {ageInYear(p.birthDate, year)} ans en {year} · {AGE_CLASS_LABEL[cls]}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {policy
                      ? `${ctx.tariffs.insurerName(policy.insurerId)} · ${MODEL_SHORT[policy.modelType as ModelType]} · ${policy.franchiseChf} (${policy.coverageYear})`
                      : "Aucun contrat"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {next !== cls && <Badge tone="up">{AGE_CLASS_LABEL[next]} en {nextYear}</Badge>}
                    {lcaCount > 0 && <Badge tone="lca">{lcaCount} LCA</Badge>}
                  </div>
                </ListRow>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
