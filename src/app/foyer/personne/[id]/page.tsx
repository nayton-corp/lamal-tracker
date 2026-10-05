import Link from "next/link";
import { ShieldAlert, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { deleteLcaAction, deletePersonAction, deletePolicyAction } from "@/app/actions/household";
import { getPerson, listInsurers, listLca, listPolicies } from "@/application/household";
import { activeReview } from "@/application/review";
import { ageClassForYear } from "@/domain/age";
import { AGE_CLASS_LABEL, displayTariffLabel, type ModelType, selectableYears } from "@/domain/lamal";
import { insurerLabel } from "@/domain/insurer";
import { currentYear, db } from "@/server/context";
import { Badge } from "@/ui/badge";
import { ConfirmButton } from "@/ui/confirm-button";
import { Card, Section } from "@/ui/card";
import { Chf } from "@/ui/money";
import { Page, PageHeader } from "@/ui/page";
import { LcaSheet, PolicySheet } from "../../editors";
import { ProfileCard } from "../../profile-card";
import { guaranteeInfo, suggestedLcaInsurer } from "@/domain/lca";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ retour?: string }> }) {
  const scope = await pageScope();
  const { id } = await params;
  const back = (await searchParams).retour === "bienvenue" ? "/bienvenue?etape=membres" : "/foyer";
  const p = getPerson(db(), scope, Number(id));
  if (!p) notFound();
  const year = currentYear();
  const allInsurers = listInsurers(db());
  const insurers = allInsurers.map((i) => ({ id: i.id, name: insurerLabel(i) }));
  const lcaInsurers = allInsurers.map((i) => ({ id: i.id, name: insurerLabel(i), lcaName: suggestedLcaInsurer({ name: insurerLabel(i), groupName: i.groupName }) }));
  const policies = listPolicies(db(), p.id).reverse();
  const lca = listLca(db(), p.id);
  const years = selectableYears(year);
  const lamalInsurerId = policies[0]?.policy.insurerId ?? null;
  const hasCurrent = policies.some((x) => x.policy.coverageYear === year);
  const openReview = activeReview(db(), scope);

  return (
    <Page wide>
      <PageHeader title={`${p.firstName} ${p.lastName}`} back={back} />

      <ProfileCard
        person={p}
        needs={{ healthCostsRp: p.healthCostsRp, allowedModels: p.allowedModels, doctorName: p.doctorName }}
        needsHref={openReview ? `/bilan/${openReview.targetYear}/preferences` : null}
        year={year}
        ageLabel={`${AGE_CLASS_LABEL[ageClassForYear(p.birthDate, year)]} en ${year}`}
      />

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
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
              Indiquez le contrat {year} : choisissez la caisse et la franchise, la prime est retrouvée toute seule. Les années précédentes sont facultatives (elles alimentent l&apos;historique).
            </p>
            <Link href={`/foyer/importer?personne=${p.id}`} className="mt-2 inline-flex min-h-11 items-center text-primary underline">
              Ou importer le PDF de la police
            </Link>
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
                    
                  </p>
                  <PolicySheet personId={p.id} insurers={insurers} years={years} label="edit" policy={{ ...policy, insurerId: policy.insurerId }} />
                  <form action={deletePolicyAction}>
                    <input type="hidden" name="id" value={policy.id} />
                    <ConfirmButton size="icon" variant="ghost" aria-label={`Supprimer le contrat ${policy.coverageYear}`} className="text-increase" message={`Supprimer le contrat ${policy.coverageYear} ?`} confirmLabel="Supprimer" details={<p>Le contrat disparaît de l&apos;historique. Votre vraie assurance n&apos;est pas touchée : rien n&apos;est envoyé à la caisse.</p>}>
                      <Trash2 aria-hidden className="size-4" />
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Complémentaires LCA" action={<LcaSheet personId={p.id} insurers={lcaInsurers} lca={null} lamalInsurerId={lamalInsurerId} />}>
        {lca.length === 0 && (
          <p className="flex gap-2 px-1 text-sm text-muted">
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-lca-strong" />
            Assurances complémentaires (hospitalisation, dentaire…) : les enregistrer permet d&apos;être alerté avant toute résiliation LAMal.
          </p>
        )}
        {lca.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {lca.map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{guaranteeInfo(c.guarantee)?.label ?? c.productName}</p>
                  <p className="truncate text-sm text-muted">
                    {c.insurerName}
                    {c.guarantee && c.productName !== guaranteeInfo(c.guarantee)?.label ? ` · ${c.productName}` : ""}
                  </p>
                </div>
                {!c.active && <Badge>terminée</Badge>}
                {c.monthlyRp ? <Chf rp={c.monthlyRp} className="font-semibold" /> : null}
                <LcaSheet personId={p.id} insurers={lcaInsurers} lca={c} lamalInsurerId={lamalInsurerId} />
                <form action={deleteLcaAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton size="icon" variant="ghost" aria-label={`Supprimer ${c.productName}`} className="text-increase" message={`Supprimer ${c.productName} ?`} confirmLabel="Supprimer" details={<p>Elle ne sera plus surveillée lors d&apos;un changement de caisse. Rien n&apos;est envoyé à l&apos;assureur.</p>}>
                    <Trash2 aria-hidden className="size-4" />
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>
      </div>

      <form action={deletePersonAction} className="pt-2 lg:max-w-sm">
        <input type="hidden" name="id" value={p.id} />
        <ConfirmButton variant="secondary" block className="text-increase" message={`Supprimer ${p.firstName} ?`} confirmLabel={`Supprimer ${p.firstName}`} details={<p>{p.firstName}, ses contrats, ses complémentaires et son historique seront effacés de l&apos;app. Rien n&apos;est envoyé à la caisse.</p>}>
          <Trash2 aria-hidden className="size-4" /> Supprimer {p.firstName} et ses contrats
        </ConfirmButton>
      </form>
    </Page>
  );
}
