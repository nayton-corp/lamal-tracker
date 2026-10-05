import { ArrowRight, CalendarClock, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReviewView } from "@/application/review";
import { formatDateLong } from "@/domain/dates";
import { displayTariffLabel, type ModelType } from "@/domain/lamal";
import { changePermille, formatChf, formatPermille } from "@/domain/money";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Chf } from "@/ui/money";
import { nextStep } from "./next-step";

const URGENCY = {
  calm: "bg-white/15 text-white",
  soon: "bg-white text-primary",
  urgent: "bg-increase-soft text-increase",
  late: "bg-increase text-white",
};

const signed = (rp: number) => `${rp >= 0 ? "+" : "−"}${formatChf(Math.abs(rp))}`;

/**
 * Écran de conscientisation : ce que le foyer paiera l'an prochain sans rien faire (reconduction
 * tacite), l'écart avec cette année, le délai et l'économie possible. `detailed` : les nouvelles
 * conditions de chaque personne.
 */
export function Awareness({ view, detailed, cta = true }: { view: ReviewView; detailed?: boolean; cta?: boolean }) {
  const t = view.totals;
  const year = view.review.targetYear;
  const diff = t.renewalMonthlyRp === null ? null : t.renewalMonthlyRp - t.currentMonthlyRp;
  const permille = t.renewalMonthlyRp === null ? null : changePermille(t.currentMonthlyRp, t.renewalMonthlyRp);
  const closed = view.review.status === "CLOSED";
  const step = nextStep(view);
  const several = view.lines.length > 1;

  return (
    <section aria-labelledby="reconduction" className="space-y-4 rounded-2xl bg-gradient-to-br from-primary to-[#1e3a8a] p-4 text-white shadow-card dark:from-[#1b2a4d] dark:to-[#131c2e] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="reconduction" className="text-sm font-medium text-white/85">
            {closed ? `Votre ${several ? "foyer" : "contrat"} en ${year}` : `Sans rien faire, en ${year} ${several ? "votre foyer paiera" : "vous paierez"}`}
          </h2>
          <p className="mt-1 text-4xl font-bold tabular">
            {t.renewalMonthlyRp === null ? "—" : <Chf rp={closed && t.chosenMonthlyRp !== null ? t.chosenMonthlyRp : t.renewalMonthlyRp} />}
            <span className="text-base font-normal text-white/80">/mois</span>
          </p>
        </div>
        {!closed && (
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold", URGENCY[view.urgency])}>
            <CalendarClock aria-hidden className="size-4" />
            {view.urgency === "late" ? "Délai passé" : `J-${view.daysToDeadline}`}
          </span>
        )}
      </div>

      {!closed && diff !== null && (
        <div className="rounded-xl bg-white/10 p-3">
          <p className="flex items-start gap-2 text-lg font-semibold">
            <TrendingUp aria-hidden className="mt-1 size-5 shrink-0" />
            <span>
              {diff > 0 ? `${signed(diff)} par mois` : diff < 0 ? `${signed(diff)} par mois` : "Même prime"}
              {permille !== null && diff !== 0 && <span className="font-normal text-white/85"> ({formatPermille(permille, false)})</span>}
            </span>
          </p>
          <p className="text-sm text-white/85">
            {diff > 0 ? `Soit ${formatChf(diff * 12, { whole: true })} de plus sur l'année. ` : ""}Sans courrier, votre caisse renouvelle aux nouvelles conditions.
          </p>
        </div>
      )}

      {detailed && !closed && (
        <ul className="divide-y divide-white/15 rounded-xl bg-white/5 text-sm">
          {view.lines.map((p) => (
            <li key={p.line.id} className="space-y-0.5 p-3">
              <p className="flex justify-between gap-2 font-semibold">
                <span>{p.person.firstName}</span>
                <span className="tabular">
                  <Chf rp={p.line.renewalMonthlyRp} />
                  {p.increaseRp !== null && p.increaseRp !== 0 && <span className="ml-1 font-normal text-white/80">({signed(p.increaseRp)})</span>}
                </span>
              </p>
              <p className="text-white/80">
                {p.currentInsurerName} · {displayTariffLabel(p.line.renewalLabel ?? p.policy.tariffLabel, p.policy.modelType as ModelType)} · franchise {p.line.renewalFranchiseChf}
                {p.line.renewalFranchiseChf !== p.policy.franchiseChf && ` (au lieu de ${p.policy.franchiseChf})`}
              </p>
              <p className="text-white/70">
                {year - 1} : <Chf rp={p.policy.billedMonthlyRp} />/mois
                {p.line.renewalMonthlyRp === null && " · nouvelle prime à confirmer"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!closed && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <p className="text-white/70">Économie possible</p>
            <p className="text-lg font-semibold tabular">{t.potentialAnnualSavingsRp > 0 ? `jusqu'à ${formatChf(t.potentialAnnualSavingsRp, { whole: true })}/an` : "déjà au meilleur prix"}</p>
          </div>
          {t.chosenMonthlyRp !== null && (
            <div>
              <p className="text-white/70">Avec vos choix</p>
              <p className="text-lg font-semibold tabular">
                <Chf rp={t.chosenMonthlyRp} />/mois
              </p>
            </div>
          )}
        </div>
      )}

      {!closed && (
        <p className="text-sm text-white/85">
          Pour changer : courrier reçu par votre caisse au plus tard le <strong>{formatDateLong(view.deadlines.receiptDeadline)}</strong>, donc envoi avant le {formatDateLong(view.deadlines.sendBy, true)}.
        </p>
      )}

      {cta && !closed && step.kind !== "close" && (
        <Button asChild block size="lg" variant="secondary" className="border-0 text-primary">
          <Link href={step.href}>
            {step.label} <ArrowRight aria-hidden className="size-5" />
          </Link>
        </Button>
      )}
    </section>
  );
}
