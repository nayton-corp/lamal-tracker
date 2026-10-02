import { ArrowRight, CalendarClock, CheckCircle2, CircleAlert, Database, FileSpreadsheet, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { getHousehold, listPersons, listPolicies } from "@/application/household";
import { getReviewByYear, getReviewView } from "@/application/review";
import { daysBetween, formatDateLong } from "@/domain/dates";
import { reviewDeadlines } from "@/domain/deadlines";
import { activeDataset, insurerLabel, parametersFor } from "@/infrastructure/db/queries";
import { db, ritualYear, today } from "@/server/context";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { Chf, Delta } from "@/ui/money";
import { EmptyState, Page } from "@/ui/page";

export const dynamic = "force-dynamic";

export default function Home() {
  const h = getHousehold(db());
  const t = today();
  const year = Number(t.slice(0, 4));
  const target = ritualYear();

  if (!h) {
    return (
      <Page>
        <header className="space-y-2 pt-6 lg:pt-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Primes LAMal</p>
          <h1 className="text-3xl font-bold leading-tight text-balance">Payez le juste prix pour votre assurance de base.</h1>
          <p className="text-muted">Chaque automne, les primes changent. L&apos;app vous montre la hausse pour votre foyer, trouve la caisse la moins chère et prépare la lettre de résiliation, prête à signer.</p>
        </header>
        <ol className="space-y-3">
          {[
            { Icon: Users, title: "Décrire le foyer", text: "Adresse, région de primes et membres." },
            { Icon: FileSpreadsheet, title: "Indiquer les contrats actuels", text: "Choisissez la caisse et la franchise : la prime est retrouvée toute seule." },
            { Icon: Database, title: "Comparer chaque automne", text: "Dès la publication des primes, l'app compare toutes les caisses et prépare la lettre." },
          ].map(({ Icon, title, text }, i) => (
            <li key={title}>
              <Card className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">{i + 1}</span>
                <div className="flex-1">
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted">{text}</p>
                </div>
                <Icon aria-hidden className="size-5 text-muted" />
              </Card>
            </li>
          ))}
        </ol>
        <Button asChild size="lg" block>
          <Link href="/foyer">
            Commencer <ArrowRight aria-hidden className="size-5" />
          </Link>
        </Button>
      </Page>
    );
  }

  const persons = listPersons(db(), h.id);
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

  const dataset = activeDataset(db(), target);
  const reviewRow = getReviewByYear(db(), target);
  const reviewView = reviewRow ? getReviewView(db(), reviewRow.id, t) : null;
  const deadlines = reviewDeadlines(target);

  if (persons.length === 0) {
    return (
      <Page>
        <header className="pt-4">
          <p className="text-sm text-muted">{h.name}</p>
          <h1 className="text-2xl font-bold">Bonjour</h1>
        </header>
        <EmptyState icon={<Users aria-hidden />} title="Qui est assuré dans votre foyer ?" action={<Button asChild><Link href="/foyer/personne/nouvelle">Ajouter une personne</Link></Button>}>
          Ajoutez chaque personne, puis sa caisse et sa franchise actuelles. C&apos;est tout.
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page wide>
      <header className="pt-4 lg:pt-0">
        <p className="text-sm text-muted">{h.name}</p>
        <h1 className="text-2xl font-bold">Bonjour</h1>
      </header>
      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-6">

      {reviewView ? (
        <Link href={`/rituel/${target}`} className="block">
          <Card className="space-y-3 border-primary/30 bg-primary-soft/40 transition-colors hover:bg-primary-soft/70">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold text-primary">
                <Sparkles aria-hidden className="size-5" /> Rituel {target}
              </p>
              {reviewView.review.status === "CLOSED" ? <Badge tone="saving">Clôturé</Badge> : <Badge tone={reviewView.urgency === "calm" ? "info" : "increase"}>J-{reviewView.daysToDeadline}</Badge>}
            </div>
            <p className="text-sm">
              {reviewView.steps.filter((s) => s.done).length}/{reviewView.steps.length} étapes · hausse sans changement :{" "}
              <Delta rp={reviewView.totals.renewalMonthlyRp === null ? null : reviewView.totals.renewalMonthlyRp - reviewView.totals.currentMonthlyRp} suffix="/mois" />
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={reviewView.steps.length} aria-valuenow={reviewView.steps.filter((s) => s.done).length} aria-label="Avancement du rituel">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(reviewView.steps.filter((s) => s.done).length / reviewView.steps.length) * 100}%` }} />
            </div>
          </Card>
        </Link>
      ) : dataset ? (
        <Card className="space-y-3 border-primary/30">
          <p className="flex items-center gap-2 font-semibold text-primary">
            <Sparkles aria-hidden className="size-5" /> Les primes {target} sont publiées
          </p>
          <p className="text-sm text-muted">Découvrez la hausse pour votre foyer et les meilleures offres. Échéance : {formatDateLong(deadlines.receiptDeadline)}.</p>
          <Button asChild block>
            <Link href={`/rituel/${target}`}>Ouvrir le rituel {target}</Link>
          </Button>
        </Card>
      ) : (
        <Card className="flex items-center gap-3">
          <CalendarClock aria-hidden className="size-6 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Prochaines primes ({target}) attendues fin septembre</p>
            <p className="text-muted">
              {daysBetween(t, `${year}-09-25`) > 0 ? `Dans environ ${daysBetween(t, `${year}-09-25`)} jours. ` : ""}L&apos;app les importe toute seule.{" "}
              <Link href="/donnees" className="text-primary underline">Vérifier maintenant</Link>
            </p>
          </div>
        </Card>
      )}

      <Section title={`Primes ${year}`}>
        <Card className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Foyer, par mois</p>
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
      {missing.length === 0 && (
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
                <Link href={`/foyer/personne/${r.p.id}`} className="flex min-h-12 items-center gap-2 rounded-xl bg-surface p-3 text-sm shadow-card">
                  <CircleAlert aria-hidden className="size-4 text-increase" /> Indiquer le contrat {year} de {r.p.firstName}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      </div>
      </div>
    </Page>
  );
}
