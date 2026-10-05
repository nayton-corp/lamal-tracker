import { CalendarClock, CheckCircle2, CircleAlert, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Awareness } from "@/app/rituel/_parts/awareness";
import { getHousehold, getHouseholdMode, listPersons, listPolicies } from "@/application/household";
import { openReviewIfPossible, getReviewView } from "@/application/review";
import { daysBetween, formatDateLong } from "@/domain/dates";
import { reviewDeadlines, isReviewWindowOpen } from "@/domain/deadlines";
import { activeDataset, insurerLabel, parametersFor } from "@/infrastructure/db/queries";
import { db, reviewTargetYear, today } from "@/server/context";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { Chf, Delta } from "@/ui/money";
import { Page } from "@/ui/page";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const scope = await pageScope();
  const householdRow = getHousehold(db(), scope);
  const t = today();
  const year = Number(t.slice(0, 4));
  const target = reviewTargetYear();

  // Première connexion : l'accueil guide la configuration (pour qui, adresse, personnes, contrats).
  if (!householdRow) redirect("/bienvenue");
  const solo = getHouseholdMode(db(), scope) === "SOLO";

  const persons = listPersons(db(), householdRow.id);
  const params = parametersFor(db(), year);
  const co2Monthly = params.co2AnnualRp === null ? 0 : Math.round(params.co2AnnualRp / 12);
  const rows = persons.map((p) => {
    const policies = listPolicies(db(), p.id);
    const current = policies.find((x) => x.policy.coverageYear === year);
    const previous = policies.find((x) => x.policy.coverageYear === year - 1);
    return { p, current, previous };
  });
  const totalCurrent = rows.reduce((a, r) => a + (r.current?.policy.billedMonthlyRp ?? 0), 0);
  const totalPrev = rows.every((r) => r.previous) ? rows.reduce((a, r) => a + r.previous!.policy.billedMonthlyRp, 0) : null;
  const missing = rows.filter((r) => !r.current);

  if (persons.length === 0) redirect("/bienvenue?etape=membres");

  const dataset = activeDataset(db(), target);
  const deadlines = reviewDeadlines(target);
  const windowOpen = isReviewWindowOpen(t, target, Boolean(dataset));
  // Pendant la fenêtre du rituel, l'analyse s'ouvre d'elle-même : l'accueil montre tout de suite
  // ce que coûtera l'année prochaine sans rien faire.
  const reviewId = windowOpen ? openReviewIfPossible(db(), scope, target) : null;
  const reviewView = reviewId ? getReviewView(db(), scope, reviewId, t) : null;

  return (
    <Page wide>
      <header className="pt-4 lg:pt-0">
        <p className="text-sm text-muted">{householdRow.name}</p>
        <h1 className="text-2xl font-bold">Bonjour{solo ? ` ${persons[0]!.firstName}` : ""}</h1>
      </header>
      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-6">

      {reviewView && reviewView.review.status !== "CLOSED" ? (
        <Awareness view={reviewView} detailed={!reviewView.review.strategy} />
      ) : reviewView ? (
        <Link href={`/rituel/${target}`} className="block">
          <Card className="flex items-center gap-3 border-saving/30 transition-colors hover:bg-surface-2">
            <CheckCircle2 aria-hidden className="size-6 shrink-0 text-saving" />
            <div className="text-sm">
              <p className="font-medium">Rituel {target} clôturé</p>
              <p className="text-muted">Vos contrats {target} sont enregistrés.</p>
            </div>
          </Card>
        </Link>
      ) : dataset && windowOpen ? (
        <Card className="space-y-3 border-primary/30">
          <p className="flex items-center gap-2 font-semibold text-primary">
            <Sparkles aria-hidden className="size-5" /> Les primes {target} sont publiées
          </p>
          <p className="text-sm text-muted">Indiquez {solo ? "votre contrat" : "les contrats"} {year} pour voir la hausse. Échéance : {formatDateLong(deadlines.receiptDeadline)}.</p>
          <Button asChild block>
            <Link href="/bienvenue?etape=contrats">Indiquer {solo ? "mon contrat" : "les contrats"} {year}</Link>
          </Button>
        </Card>
      ) : (
        <Card className="flex items-center gap-3">
          <CalendarClock aria-hidden className="size-6 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Prochaines primes ({target}) attendues fin septembre</p>
            <p className="text-muted">
              {daysBetween(t, `${year}-09-25`) > 0 ? `Dans environ ${daysBetween(t, `${year}-09-25`)} jours. ` : ""}L&apos;app les importe toute seule et vous prévient.{" "}
              <Link href="/donnees" className="text-primary underline">Vérifier maintenant</Link>
            </p>
          </div>
        </Card>
      )}

      <Section title={solo ? `Votre prime ${year}` : `Primes ${year}`}>
        <Card className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{solo ? "Par mois" : "Foyer, par mois"}</p>
              <p className="text-3xl font-bold">
                <Chf rp={totalCurrent} />
              </p>
              {co2Monthly > 0 && (
                <p className="text-sm text-muted">
                  après redistribution CO2 : <Chf rp={totalCurrent - co2Monthly * rows.filter((r) => r.current).length} />
                </p>
              )}
            </div>
            {totalPrev !== null && totalPrev > 0 && <Delta rp={totalCurrent - totalPrev} permille={Math.round(((totalCurrent - totalPrev) * 1000) / totalPrev)} />}
          </div>
          <ul className="divide-y divide-border">
            {rows.map(({ p, current }) => (
              <li key={p.id}>
                <Link href={`/foyer/personne/${p.id}`} className="flex min-h-12 items-center gap-3 py-2">
                  <span className="flex-1">
                    <span className="block font-medium">{p.firstName}</span>
                    <span className="block text-sm text-muted">{current ? `${insurerLabel(current.insurer)} · franchise ${current.policy.franchiseChf}` : "contrat à saisir"}</span>
                  </span>
                  <Chf rp={current?.policy.billedMonthlyRp ?? null} className="font-semibold" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">Par an : <Chf rp={totalCurrent * 12} whole /></p>
        </Card>
      </Section>

      </div>
      <div className="space-y-6">
      {missing.length === 0 && !(reviewView && reviewView.review.status !== "CLOSED") && (
        <Section title="À compléter">
          <p className="flex items-center gap-2 rounded-xl bg-surface p-3 text-sm text-muted shadow-card">
            <CheckCircle2 aria-hidden className="size-4 text-saving" /> Rien à faire pour le moment.
          </p>
        </Section>
      )}
      {missing.length > 0 && (
        <Section title="À compléter">
          <ul className="space-y-2">
            {missing.map((r) => (
              <li key={r.p.id}>
                <Link href="/bienvenue?etape=contrats" className="flex min-h-12 items-center gap-2 rounded-xl bg-surface p-3 text-sm shadow-card">
                  <CircleAlert aria-hidden className="size-4 text-increase" /> Indiquer {solo ? "votre" : "le"} contrat {year}{solo ? "" : ` de ${r.p.firstName}`}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="flex items-start gap-2 rounded-xl bg-surface p-3 text-xs text-muted shadow-card">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-saving" />
        <span>Données officielles OFSP et OFEV. Toutes les caisses, aucune commission, données hébergées en Suisse et jamais revendues.</span>
      </p>
      </div>
      </div>
    </Page>
  );
}
