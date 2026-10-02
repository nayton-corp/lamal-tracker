import { ChevronRight, FileUp, Plus, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { getHousehold, listLca, listPersons, listPolicies } from "@/application/household";
import { ageClassForYear } from "@/domain/age";
import { AGE_CLASS_LABEL } from "@/domain/lamal";
import { formatDateShort } from "@/domain/dates";
import { insurerLabel } from "@/infrastructure/db/queries";
import { db, today } from "@/server/context";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { Chf } from "@/ui/money";
import { EmptyState, Page, PageHeader } from "@/ui/page";
import { HouseholdCard } from "./household-card";
import { HouseholdForm } from "./household-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Foyer" };

export default function FoyerPage() {
  const h = getHousehold(db());
  const year = Number(today().slice(0, 4));
  const persons = h ? listPersons(db(), h.id) : [];

  return (
    <Page wide={Boolean(h)}>
      <PageHeader title="Foyer" subtitle={h ? undefined : "Commencez par décrire votre foyer : l'adresse sert d'expéditeur des lettres, le code postal donne la région de primes."} />

      {h ? (
        <HouseholdCard household={h} />
      ) : (
        <Card>
          <HouseholdForm household={null} />
        </Card>
      )}

      {h && (
        <Section
          title="Membres"
          action={
            <div className="flex gap-1">
              {persons.length > 0 && (
                <Button asChild size="sm" variant="ghost">
                  <Link href="/foyer/importer">
                    <FileUp aria-hidden className="size-4" /> Importer une police
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant="ghost">
                <Link href="/foyer/personne/nouvelle">
                  <Plus aria-hidden className="size-4" /> Ajouter une personne
                </Link>
              </Button>
            </div>
          }
        >
          {persons.length === 0 ? (
            <EmptyState icon={<Users aria-hidden />} title="Aucun membre" action={<Button asChild><Link href="/foyer/personne/nouvelle">Ajouter une personne</Link></Button>}>
              Ajoutez chaque personne assurée, puis son contrat LAMal de l&apos;année en cours.
            </EmptyState>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {persons.map((p) => {
                const policies = listPolicies(db(), p.id);
                const current = policies.find((x) => x.policy.coverageYear === year);
                const lca = listLca(db(), p.id).filter((l) => l.active);
                const ageClass = ageClassForYear(p.birthDate, year);
                return (
                  <li key={p.id}>
                    <Link href={`/foyer/personne/${p.id}`} className="block h-full rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-2">
                      <div className="flex items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                          <UserRound aria-hidden className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {p.firstName} {p.lastName}
                          </p>
                          <p className="text-sm text-muted">
                            {formatDateShort(p.birthDate)} · {AGE_CLASS_LABEL[ageClass]}
                          </p>
                        </div>
                        <ChevronRight aria-hidden className="size-5 text-muted" />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        {current ? (
                          <>
                            <Badge tone="primary">{insurerLabel(current.insurer)}</Badge>
                            <Badge>Franchise {current.policy.franchiseChf}</Badge>
                            <span className="ml-auto font-semibold">
                              <Chf rp={current.policy.billedMonthlyRp} />
                              <span className="font-normal text-muted">/mois</span>
                            </span>
                          </>
                        ) : (
                          <Badge tone="increase">Contrat {year} à indiquer</Badge>
                        )}
                        {lca.length > 0 && <Badge tone="lca">{lca.length} LCA</Badge>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}
    </Page>
  );
}
