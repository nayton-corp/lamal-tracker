import { ArrowRight, CalendarClock, CheckCircle2, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { HomeOverview } from "@/application/home";
import type { ReviewView } from "@/application/review";
import { daysBetween, formatDateLong } from "@/domain/dates";
import { reviewDeadlines, urgency as urgencyOf } from "@/domain/deadlines";
import { yearCardState, yearCardTask } from "@/domain/home";
import { formatChf } from "@/domain/money";
import { needsLetter } from "@/domain/ritual-steps";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Chf } from "@/ui/money";
import { taskHref } from "./task-href";

const URGENCY = {
  calm: "bg-white/15 text-white",
  soon: "bg-white text-primary",
  urgent: "bg-increase-soft text-increase",
  late: "bg-increase text-white",
};

const signed = (rp: number) => `${rp >= 0 ? "+" : "−"}${formatChf(Math.abs(rp))}`;
const sum = (xs: (number | null)[]) => (xs.some((x) => x === null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0));

interface PersonRow {
  key: number;
  firstName: string;
  monthlyRp: number | null;
  /** Écart avec la prime de cette année ; null s'il n'a pas de sens. */
  diffRp: number | null;
  detail: string | null;
}

/**
 * Carte de l'année de l'accueil : où en est le foyer pour l'an prochain, en six états
 * (domain/home.ts). Un montant, une phrase, un seul bouton ; le détail par personne se déplie.
 */
export function YearCard({ overview, solo }: { overview: HomeOverview; solo: boolean }) {
  const { facts, view } = overview;
  const state = yearCardState(facts);
  const task = yearCardTask(facts);
  const year = facts.targetYear;
  const deadlines = reviewDeadlines(year);
  const daysLeft = daysBetween(facts.today, deadlines.receiptDeadline);
  const several = overview.current.length > 1;
  const t = view?.totals;

  let label: string;
  let amountRp: number | null;
  let perMonth = true;
  let sentence: React.ReactNode;
  let rows: PersonRow[];
  let href = task ? taskHref(task.target, year, view) : null;
  let cta = task?.label ?? null;
  const currentRows = (): PersonRow[] => overview.current.map((c) => ({ key: c.personId, firstName: c.firstName, monthlyRp: c.monthlyRp, diffRp: null, detail: c.monthlyRp === null ? "contrat à indiquer" : null }));
  const lineRows = (v: ReviewView, chosen: boolean): PersonRow[] =>
    v.lines.map((p) => {
      const decided = chosen && p.line.decision !== "UNDECIDED" && p.line.chosenMonthlyRp !== null;
      const monthly = decided ? p.line.chosenMonthlyRp : p.line.renewalMonthlyRp;
      return {
        key: p.line.id,
        firstName: p.person.firstName,
        monthlyRp: monthly,
        diffRp: monthly === null ? null : monthly - p.policy.billedMonthlyRp,
        detail: decided ? `${p.chosenInsurerName ?? p.currentInsurerName}, franchise ${p.line.chosenFranchiseChf}` : `${p.currentInsurerName}, sans rien changer`,
      };
    });

  switch (state) {
    case "NOT_PUBLISHED": {
      label = `${several ? "Votre foyer paie" : "Vous payez"} en ${facts.contractYear}`;
      amountRp = sum(overview.current.map((c) => c.monthlyRp ?? 0));
      sentence = `Les primes ${year} arrivent fin septembre. L'app les importe et vous prévient.`;
      rows = currentRows();
      break;
    }
    case "NOT_STARTED": {
      if (!view) {
        label = `${several ? "Votre foyer paie" : "Vous payez"} en ${facts.contractYear}`;
        amountRp = sum(overview.current.map((c) => c.monthlyRp ?? 0));
        sentence = `Les primes ${year} sont publiées. Indiquez ${solo ? "votre contrat" : "les contrats"} ${facts.contractYear} pour voir la hausse.`;
        rows = currentRows();
        break;
      }
      label = `Sans rien faire, en ${year}`;
      amountRp = t!.renewalMonthlyRp;
      const diff = t!.renewalMonthlyRp === null ? null : t!.renewalMonthlyRp - t!.currentMonthlyRp;
      sentence = (
        <>
          {diff !== null && diff !== 0 && <>{diff > 0 ? "Hausse" : "Baisse"} de {signed(diff)} par mois. </>}
          {t!.potentialAnnualSavingsRp > 0 ? (
            <>
              Économie possible jusqu&apos;à <strong>{formatChf(t!.potentialAnnualSavingsRp, { whole: true })}/an</strong>.
            </>
          ) : (
            "Votre contrat est déjà au meilleur prix."
          )}
        </>
      );
      rows = lineRows(view, false);
      break;
    }
    case "CHOOSING": {
      const decided = view!.lines.filter((p) => p.line.decision !== "UNDECIDED").length;
      label = "Avec vos choix";
      amountRp = sum(view!.lines.map((p) => (p.line.decision !== "UNDECIDED" ? p.line.chosenMonthlyRp : p.line.renewalMonthlyRp)));
      const saved = t!.chosenAnnualSavingsRp;
      sentence = (
        <>
          {decided === 0 ? "Aucun choix pour l'instant." : `${decided} ${decided > 1 ? "personnes" : "personne"} sur ${view!.lines.length} ${decided > 1 ? "choisies" : "choisie"}`}
          {decided > 0 && saved > 0 && (
            <>
              , déjà <strong>{formatChf(saved, { whole: true })}/an</strong> d&apos;économie
            </>
          )}
          {decided > 0 && "."}
        </>
      );
      rows = lineRows(view!, true);
      break;
    }
    case "TO_SEND": {
      const saved = t!.chosenAnnualSavingsRp;
      const documents = facts.review!.unsentDocuments.length;
      const toPrepare = documents === 0 && view!.letters.length === 0;
      if (saved > 0) {
        label = "Économie prévue";
        amountRp = saved;
        perMonth = false;
      } else {
        label = "Avec vos choix";
        amountRp = t!.chosenMonthlyRp;
      }
      sentence = toPrepare
        ? `Courriers à préparer et envoyer avant le ${formatDateLong(deadlines.sendBy)}.`
        : `${documents} ${documents > 1 ? "courriers" : "courrier"} à envoyer avant le ${formatDateLong(deadlines.sendBy)}.`;
      rows = lineRows(view!, true);
      break;
    }
    case "DONE": {
      const saved = t!.chosenAnnualSavingsRp;
      label = `En ${year}`;
      amountRp = t!.chosenMonthlyRp ?? t!.renewalMonthlyRp;
      const changed = view!.lines.some((p) => needsLetter(p.line.decision));
      sentence = (
        <>
          C&apos;est fait{saved > 0 ? <>, <strong>{formatChf(saved, { whole: true })}/an</strong> économisés</> : ""}.{" "}
          {changed ? "Gardez les confirmations des caisses." : `Vos contrats ${year} sont enregistrés.`}
        </>
      );
      rows = lineRows(view!, true);
      href = `/rituel/${year}`;
      cta = "Voir le bilan";
      break;
    }
    case "MISSED": {
      label = `En ${year}`;
      amountRp = t?.renewalMonthlyRp ?? null;
      sentence = `Le délai est passé : votre caisse renouvelle aux nouvelles conditions. Prochaine occasion : automne ${year}.`;
      rows = view ? lineRows(view, false) : currentRows();
      break;
    }
  }

  const done = state === "DONE";
  const countdown = state === "NOT_STARTED" || state === "CHOOSING" || state === "TO_SEND";
  const urgency = urgencyOf(facts.today, deadlines);

  return (
    <section
      aria-labelledby="carte-annee"
      className={cn(
        "space-y-4 rounded-2xl bg-gradient-to-br p-4 text-white shadow-card sm:p-5",
        done ? "from-[#047857] to-[#065f46] dark:from-[#14532d] dark:to-[#0f2a1c]" : "from-primary to-[#1e3a8a] dark:from-[#1b2a4d] dark:to-[#131c2e]",
      )}
    >
      <details className="group">
        <summary className="cursor-pointer list-none space-y-3 [&::-webkit-details-marker]:hidden">
          <span className="flex items-start justify-between gap-3">
            <span>
              <span id="carte-annee" className="block text-sm font-medium text-white/85">
                {label}
              </span>
              <span className="mt-1 block text-4xl font-bold tabular">
                {amountRp === null ? "—" : <Chf rp={amountRp} whole={!perMonth} />}
                <span className="text-base font-normal text-white/80">{perMonth ? "/mois" : "/an"}</span>
              </span>
            </span>
            {countdown ? (
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold", URGENCY[urgency])}>
                <CalendarClock aria-hidden className="size-4" />
                J-{daysLeft}
              </span>
            ) : done ? (
              <CheckCircle2 aria-hidden className="size-7 shrink-0" />
            ) : null}
          </span>
          <span className="block text-white/90">{sentence}</span>
          <span className="flex items-center gap-1 text-sm text-white/75">
            <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
            {several ? "Détail par personne" : "Détail"}
          </span>
        </summary>
        <ul className="mt-3 divide-y divide-white/15 rounded-xl bg-white/10 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="space-y-0.5 p-3">
              <p className="flex justify-between gap-2 font-semibold">
                <span>{r.firstName}</span>
                <span className="tabular">
                  <Chf rp={r.monthlyRp} />
                  {r.diffRp !== null && r.diffRp !== 0 && <span className="ml-1 font-normal text-white/80">({signed(r.diffRp)})</span>}
                </span>
              </p>
              {r.detail && <p className="text-white/75">{r.detail}</p>}
            </li>
          ))}
        </ul>
        {countdown && (
          <p className="mt-3 text-sm text-white/85">
            Pour changer : courrier reçu par la caisse au plus tard le <strong>{formatDateLong(deadlines.receiptDeadline)}</strong>.
          </p>
        )}
      </details>

      {href && cta && (
        <Button asChild block size="lg" variant="secondary" className={cn("border-0", done ? "text-saving" : "text-primary")}>
          <Link href={href}>
            {cta} <ArrowRight aria-hidden className="size-5" />
          </Link>
        </Button>
      )}
    </section>
  );
}
