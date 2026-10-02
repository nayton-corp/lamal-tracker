import { ShieldAlert, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { deleteLcaAction, deletePersonAction, deletePolicyAction } from "@/app/actions/household";
import { getPerson, listInsurers, listLca, listPolicies } from "@/application/household";
import { ageClassForYear } from "@/domain/age";
import { AGE_CLASS_LABEL, displayTariffLabel, type ModelType } from "@/domain/lamal";
import { insurerLabel } from "@/infrastructure/db/queries";
import { db, today } from "@/server/context";
import { Badge } from "@/ui/badge";
import { ConfirmButton } from "@/ui/confirm-button";
import { Card, Section } from "@/ui/card";
import { Chf } from "@/ui/money";
import { Page, PageHeader } from "@/ui/page";
import { LcaSheet, PolicySheet } from "../../editors";
import { ProfileCard } from "../../profile-card";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPerson(db(), Number(id));
  if (!p) notFound();
  const year = Number(today().slice(0, 4));
  const insurers = listInsurers(db()).map((i) => ({ id: i.id, name: insurerLabel(i) }));
  const policies = listPolicies(db(), p.id).reverse();
  const lca = listLca(db(), p.id);
  // Contrats saisissables de 2010 à l'année prochaine (historique personnel).
  const years = Array.from({ length: year + 2 - 2010 }, (_, i) => year + 1 - i);
  const hasCurrent = policies.some((x) => x.policy.coverageYear === year);

  return (
    <Page>
      <PageHeader title={`${p.firstName} ${p.lastName}`} back="/foyer" />

      <ProfileCard person={p} insurers={insurers} year={year} ageLabel={`${AGE_CLASS_LABEL[ageClassForYear(p.birthDate, year)]} en ${year}`} />

      <Section
        title="Contrats LAMal"
        action={
          <PolicySheet
            personId={p.id}
            insurers={insurers}
            years={years}
            label="add"
            policy={{ coverageYear: hasCurrent ? year - 1 : year, insurerId: policies[0]?.policy.insurerId ?? null, policyNumber: policies[0]?.policy.policyNumber ?? null, tariffCode: null, tariffLabel: null, modelType: "STANDARD", franchiseChf: 300, accident: !p.employedAccidentCover, billedMonthlyRp: null }}
          />
        }
      >
        {policies.length === 0 ? (
          <Card>
            <p className="text-muted">
              Ajoutez le contrat {year} (et les années précédentes si vous les avez : l&apos;historique se construit à partir d&apos;eux).
            </p>
          </Card>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {policies.map(({ policy, insurer }) => (
              <li key={policy.id} className="p-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-lg font-bold tabular">{policy.coverageYear}</span>
                  <span className="min-w-0 flex-1 font-medium">{insurerLabel(insurer)}</span>
                  <Chf rp={policy.billedMonthlyRp} className="font-semibold" />
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm text-muted">
                    {displayTariffLabel(policy.tariffLabel, policy.modelType as ModelType)} · franchise {policy.franchiseChf}
                    {policy.accident ? " · avec accident" : ""}
                    {policy.policyNumber ? ` · n° ${policy.policyNumber}` : ""}
                  </p>
                  <PolicySheet personId={p.id} insurers={insurers} years={years} label="edit" policy={{ ...policy, insurerId: policy.insurerId }} />
                  <form action={deletePolicyAction}>
                    <input type="hidden" name="id" value={policy.id} />
                    <ConfirmButton size="icon" variant="ghost" aria-label={`Supprimer le contrat ${policy.coverageYear}`} className="text-increase" message={`Supprimer le contrat ${policy.coverageYear} ?`}>
                      <Trash2 aria-hidden className="size-4" />
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Complémentaires LCA" action={<LcaSheet personId={p.id} insurers={insurers} lca={null} />}>
        <div className="flex gap-3 rounded-xl border border-lca-strong/40 bg-lca-soft p-3 text-sm text-lca">
          <ShieldAlert aria-hidden className="size-5 shrink-0" />
          <p>Les assurances complémentaires sont des contrats privés séparés. Les enregistrer ici permet à l&apos;app de vous alerter avant toute résiliation LAMal.</p>
        </div>
        {lca.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {lca.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.productName}</p>
                  <p className="truncate text-sm text-muted">{c.insurerName}</p>
                </div>
                {!c.active && <Badge>terminée</Badge>}
                {c.monthlyRp ? <Chf rp={c.monthlyRp} className="font-semibold" /> : null}
                <LcaSheet personId={p.id} insurers={insurers} lca={c} />
                <form action={deleteLcaAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton size="icon" variant="ghost" aria-label={`Supprimer ${c.productName}`} className="text-increase" message={`Supprimer ${c.productName} ?`}>
                    <Trash2 aria-hidden className="size-4" />
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>


      <form action={deletePersonAction} className="pt-2">
        <input type="hidden" name="id" value={p.id} />
        <ConfirmButton variant="secondary" block className="text-increase" message={`Supprimer ${p.firstName} et tout son historique ?`}>
          <Trash2 aria-hidden className="size-4" /> Supprimer {p.firstName} et ses contrats
        </ConfirmButton>
      </form>
    </Page>
  );
}
