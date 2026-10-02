import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archivePersonAction } from "@/app/actions";
import { AGE_CLASS_LABEL, ageClassFor, ageInYear } from "@/domain/age-class";
import { formatDateShort } from "@/domain/calendar";
import { isReviewSeason, reviewTargetYear } from "@/domain/deadlines";
import { MODEL_LABEL, type ModelType } from "@/domain/insurance-model";
import { earliestLcaTermination, LCA_CATEGORY_LABEL } from "@/domain/lca";
import { allowedFranchises } from "@/domain/lamal-parameters";
import { app } from "@/server/app";
import { Chf } from "@/ui/amount";
import { PrefsForm } from "@/ui/forms/household-forms";
import { Badge, ButtonLink, Card, CardTitle, ListRow, PageHeader } from "@/ui/primitives";

export const metadata: Metadata = { title: "Personne" };

export default async function PersonPage({ params }: PageProps<"/foyer/[personId]">) {
  const { personId } = await params;
  const ctx = app();
  const person = ctx.household.person(Number(personId));
  if (!person) notFound();
  const today = ctx.clock.today();
  const year = Number(today.slice(0, 4));
  const policyYear = isReviewSeason(today) ? reviewTargetYear(today) - 1 : year;
  const policies = ctx.household.policies(person.id);
  const prefs = ctx.household.prefs(person.id);
  const h = ctx.household.household()!;
  const lca = ctx.household.lcaPolicies(h.id).filter((l) => l.personId === person.id);
  const params2 = ctx.reference.parameters(reviewTargetYear(today));
  const insurers = ctx.reference.insurers().map((i) => ({ id: i.id, name: i.name }));
  const hasCurrent = policies.some((p) => p.coverageYear === policyYear);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`${person.firstName} ${person.lastName}`}
        subtitle={`Né·e le ${formatDateShort(person.birthDate)} · ${ageInYear(person.birthDate, year)} ans en ${year} · ${AGE_CLASS_LABEL[ageClassFor(person.birthDate, year)]}`}
        back="/foyer"
        action={
          <ButtonLink href={`/foyer/${person.id}/edition`} variant="ghost" className="min-h-10 px-3 text-sm">
            Modifier
          </ButtonLink>
        }
      />

      <Card>
        <CardTitle
          action={
            <ButtonLink href={`/foyer/${person.id}/contrat?annee=${hasCurrent ? policyYear - 1 : policyYear}`} variant="ghost" className="min-h-10 px-3 text-sm">
              + Contrat {hasCurrent ? policyYear - 1 : policyYear}
            </ButtonLink>
          }
        >
          Assurance de base (LAMal)
        </CardTitle>
        {policies.length === 0 ? (
          <p className="text-sm text-muted">Saisis le contrat {policyYear} : caisse, modèle, franchise et prime mensuelle figurent sur ta police.</p>
        ) : (
          <ul>
            {policies.map((p) => (
              <ListRow key={p.id} href={`/foyer/${person.id}/contrat?annee=${p.coverageYear}`} trailing={<Chf rp={p.billedMonthlyRp} className="text-sm font-semibold" />}>
                <p className="font-semibold">
                  {p.coverageYear} · {ctx.tariffs.insurerName(p.insurerId)}
                </p>
                <p className="text-sm text-muted">
                  {MODEL_LABEL[p.modelType as ModelType]} · franchise {p.franchiseChf}
                  {p.accidentIncluded ? " · avec accident" : ""}
                </p>
                <div className="mt-1 flex gap-1">
                  {p.source === "OFSP_MATCH" || p.source === "REVIEW" ? <Badge tone="down">Tarif OFSP lié</Badge> : <Badge>Saisi à la main</Badge>}
                  {!p.policyNumber && <Badge tone="up">N° de police manquant</Badge>}
                </div>
              </ListRow>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-lca-strong/50">
        <CardTitle
          action={
            <ButtonLink href={`/foyer/${person.id}/lca/nouvelle`} variant="ghost" className="min-h-10 px-3 text-sm text-lca">
              + Complémentaire
            </ButtonLink>
          }
        >
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full bg-lca-strong" />
            Complémentaires (LCA)
          </span>
        </CardTitle>
        {lca.length === 0 ? (
          <p className="text-sm text-muted">Aucune complémentaire. Elles sont indépendantes de la LAMal et ne sont jamais résiliées par l&apos;application.</p>
        ) : (
          <ul>
            {lca.map((l) => (
              <ListRow
                key={l.id}
                href={`/foyer/${person.id}/lca/${l.id}`}
                trailing={l.monthlyPremiumRp !== null ? <Chf rp={l.monthlyPremiumRp} className="text-sm font-semibold" /> : null}
              >
                <p className="font-semibold">{l.productName}</p>
                <p className="text-sm text-muted">
                  {ctx.tariffs.insurerName(l.insurerId)} · {LCA_CATEGORY_LABEL[l.category]}
                </p>
                <p className="text-xs text-muted">
                  {l.status === "ACTIVE"
                    ? `Résiliable au plus tôt pour le ${formatDateShort(earliestLcaTermination({ ...l, monthlyPremiumRp: l.monthlyPremiumRp }, today))} (indicatif)`
                    : "Résiliée"}
                </p>
              </ListRow>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Préférences de comparaison</CardTitle>
        <PrefsForm
          personId={person.id}
          values={{ ...prefs, allowedModels: prefs.allowedModels, allowedFranchises: prefs.allowedFranchises }}
          franchises={allowedFranchises(params2, ageClassFor(person.birthDate, reviewTargetYear(today)))}
          insurers={insurers}
        />
      </Card>

      <form action={archivePersonAction} className="text-center">
        <input type="hidden" name="id" value={person.id} />
        <button type="submit" className="min-h-11 text-sm font-medium text-up underline-offset-4 hover:underline">
          Retirer {person.firstName} du foyer (l&apos;historique est conservé)
        </button>
      </form>
      <p className="text-center text-xs text-muted">
        <Link href="/historique" className="underline">
          Voir l&apos;historique des primes
        </Link>
      </p>
    </div>
  );
}
