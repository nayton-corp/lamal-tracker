import { ChevronRight, FileUp, KeyRound, Plus, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getHousehold, getHouseholdMode, listLca, listPersons, listPolicies } from "@/application/household";
import { ageClassForYear } from "@/domain/age";
import { AGE_CLASS_LABEL } from "@/domain/lamal";
import { formatDateShort } from "@/domain/dates";
import { insurerLabel } from "@/infrastructure/db/queries";
import { db, today } from "@/server/context";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Section } from "@/ui/card";
import { Chf } from "@/ui/money";
import { EmptyState, Page, PageHeader } from "@/ui/page";
import { HouseholdCard } from "./household-card";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Foyer" };

export default async function FoyerPage() {
  const scope = await pageScope();
  const h = getHousehold(db(), scope);
  if (!h) redirect("/bienvenue");
  const year = Number(today().slice(0, 4));
  const persons = listPersons(db(), h.id);
  const solo = getHouseholdMode(db(), scope) === "SOLO" && persons.length <= 1;
  const first = persons[0];

  return (
    <Page wide>
      <PageHeader title={solo ? "Moi" : "Foyer"} />

      <HouseholdCard household={h} person={solo ? (first ? { firstName: first.firstName, lastName: first.lastName, birthDate: first.birthDate } : null) : undefined} />

      {(
        <Section
          title={solo ? "Mes contrats" : "Membres"}
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
                  <Plus aria-hidden className="size-4" /> {solo ? "Passer en foyer" : "Ajouter une personne"}
                </Link>
              </Button>
            </div>
          }
        >
          {persons.length === 0 ? (
            <EmptyState icon={<Users aria-hidden />} title="Personne n'est encore enregistré" action={<Button asChild><Link href="/bienvenue">Commencer</Link></Button>}>
              L&apos;accueil guide la saisie, à partir de la police si vous l&apos;avez.
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

      <Link href="/foyer/comptes" className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:bg-surface-2">
        <KeyRound aria-hidden className="size-5 text-primary" />
        <div className="flex-1">
          <p className="font-medium">Accès au foyer</p>
          <p className="text-sm text-muted">Inviter votre conjoint ou partenaire à partager ce foyer avec son propre compte.</p>
        </div>
        <ChevronRight aria-hidden className="size-5 text-muted" />
      </Link>
    </Page>
  );
}
