import { ChevronRight, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getHousehold, getHouseholdMode, listPersons } from "@/application/household";
import { homeOverview } from "@/application/home";
import { homeTasks } from "@/domain/home";
import { db, reviewTargetYear, today } from "@/server/context";
import { Section } from "@/ui/card";
import { Page } from "@/ui/page";
import { pageScope } from "@/server/auth";
import { taskHref } from "./_home/task-href";
import { YearCard } from "./_home/year-card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const scope = await pageScope();
  const householdRow = getHousehold(db(), scope);
  // Première connexion : l'accueil guide la configuration (pour qui, adresse, personnes, contrats).
  if (!householdRow) redirect("/bienvenue");
  const persons = listPersons(db(), householdRow.id);
  if (persons.length === 0) redirect("/bienvenue?etape=membres");
  const solo = getHouseholdMode(db(), scope) === "SOLO";

  const target = reviewTargetYear();
  const overview = homeOverview(db(), scope, { today: today(), targetYear: target })!;
  const tasks = homeTasks(overview.facts);

  return (
    <Page wide>
      <header className="pt-4 lg:pt-0">
        <p className="text-sm text-muted">{householdRow.name}</p>
        <h1 className="text-2xl font-bold">Bonjour{solo ? ` ${persons[0]!.firstName}` : ""}</h1>
      </header>
      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-8 lg:space-y-0">
        <YearCard overview={overview} solo={solo} />
        <div className="space-y-6">
          <Section title="À faire">
            {tasks.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl bg-surface p-3 text-sm text-muted shadow-card">
                <CheckCircle2 aria-hidden className="size-4 text-saving" /> Tout est à jour.
              </p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li key={t.key}>
                    <Link href={taskHref(t.target, target, overview.view)} className="flex min-h-12 items-center gap-2 rounded-xl bg-surface p-3 text-sm font-medium shadow-card hover:bg-surface-2">
                      <span className="flex-1">{t.label}</span>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <p className="flex items-start gap-2 rounded-xl bg-surface p-3 text-xs text-muted shadow-card">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-saving" />
            <span>Données officielles OFSP et OFEV. Toutes les caisses, aucune commission, données hébergées en Suisse et jamais revendues.</span>
          </p>
        </div>
      </div>
    </Page>
  );
}
