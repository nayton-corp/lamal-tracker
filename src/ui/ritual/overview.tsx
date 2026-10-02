import Link from "next/link";
import type { ReviewOverview } from "@/application/review";
import { formatDateFr } from "@/domain/calendar";
import { MODEL_SHORT, type ModelType } from "@/domain/insurance-model";
import { formatChf } from "@/domain/money";
import { DECISION_LABEL, REVIEW_STATUS_LABEL, ritualSteps } from "@/domain/review";
import { Chf, Delta, Saving } from "../amount";
import { cn } from "../cn";
import { Badge, ButtonLink, Card } from "../primitives";

export function Countdown({ overview }: { overview: ReviewOverview }) {
  const { daysLeft, level } = overview.countdown;
  const sendBy = formatDateFr(overview.review.recommendedSendBy, true);
  const tone =
    level === "overdue"
      ? "bg-up text-white"
      : level === "urgent"
        ? "bg-up-soft text-up"
        : level === "soon"
          ? "bg-lca-soft text-text"
          : "bg-surface-2 text-text";
  if (overview.review.status === "CLOSED") return null;
  return (
    <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2", tone)}>
      <span className="num text-2xl font-extrabold">{daysLeft >= 0 ? `J-${daysLeft}` : `J+${-daysLeft}`}</span>
      <span className="text-sm leading-tight">
        {daysLeft >= 0 ? (
          <>
            avant l&apos;envoi recommandé conseillé, le <strong>{sendBy}</strong>
            <br />
            <span className="opacity-80">Réception par la caisse au plus tard le {formatDateFr(overview.review.deadlineDate)}</span>
          </>
        ) : (
          <>Date d&apos;envoi conseillée dépassée : réception exigée au plus tard le {formatDateFr(overview.review.deadlineDate)}</>
        )}
      </span>
    </div>
  );
}

export function Steps({ overview }: { overview: ReviewOverview }) {
  const steps = ritualSteps(overview.review.status, overview.needsLca);
  return (
    <ol className="flex gap-1" aria-label="Étapes du rituel">
      {steps.map((s) => (
        <li key={s.key} className="flex-1">
          <div className={cn("h-1.5 rounded-full", s.state === "done" ? "bg-primary" : s.state === "current" ? "bg-primary/50" : "bg-surface-2")} />
          <p className={cn("mt-1 text-[11px] font-medium", s.state === "todo" ? "text-muted" : "text-text")}>
            {s.label}
            <span className="sr-only">{s.state === "done" ? " (terminé)" : s.state === "current" ? " (en cours)" : " (à faire)"}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

export function RitualHeader({ overview }: { overview: ReviewOverview }) {
  const { totals, review } = overview;
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted">Ton foyer en {review.targetYear}</p>
          <Badge tone={review.status === "CLOSED" ? "down" : "info"}>{REVIEW_STATUS_LABEL[review.status]}</Badge>
        </div>
        {totals.currentMonthlyRp > 0 ? (
          <p className="mt-1 text-2xl font-extrabold leading-tight">
            <Delta rp={totals.deltaMonthlyRp} bp={totals.changeBp} suffix="/mois" />
          </p>
        ) : (
          <p className="mt-1 text-lg font-semibold">Saisis les contrats actuels pour voir la hausse.</p>
        )}
        {totals.currentMonthlyRp > 0 && (
          <p className="num mt-1 text-sm text-muted">
            {formatChf(totals.currentMonthlyRp)} → {formatChf(totals.renewalMonthlyRp)} par mois
            {!totals.complete && " (personnes avec contrat connu)"}
          </p>
        )}
        {totals.potentialSavingRp > 0 && review.status === "DRAFT" && (
          <p className="mt-2 text-sm">
            En choisissant les meilleures offres : <Saving rp={totals.potentialSavingRp} />
          </p>
        )}
        {totals.chosenMonthlyRp !== null && (
          <p className="num mt-2 text-sm">
            Après tes décisions : <strong>{formatChf(totals.chosenMonthlyRp)}/mois</strong>{" "}
            {totals.renewalMonthlyRp > 0 && <Delta rp={totals.chosenMonthlyRp - totals.renewalMonthlyRp} suffix="/mois" className="text-sm" />}
          </p>
        )}
      </div>
      <Countdown overview={overview} />
      <Steps overview={overview} />
    </Card>
  );
}

export function PersonCards({ overview }: { overview: ReviewOverview }) {
  const year = overview.review.targetYear;
  return (
    <ul className="flex flex-col gap-3">
      {overview.lines.map((l) => (
        <li key={l.line.id}>
          <Link
            href={`/rituel/${year}/${l.line.id}`}
            className="block rounded-2xl border border-border bg-surface p-4 shadow-card transition active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-bold">{l.person.firstName}</p>
                <p className="truncate text-sm text-muted">
                  {l.current
                    ? `${l.current.insurerName} · ${MODEL_SHORT[l.current.modelType as ModelType]} · franchise ${l.current.franchiseChf}`
                    : "Contrat actuel non saisi"}
                </p>
              </div>
              {l.line.decision ? (
                <Badge tone={l.line.decision === "SWITCH" ? "info" : "neutral"} className="shrink-0 whitespace-nowrap">
                  {DECISION_LABEL[l.line.decision]}
                </Badge>
              ) : (
                <Badge>À décider</Badge>
              )}
            </div>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Hausse {year}</p>
                {l.change ? (
                  <Delta rp={l.change.deltaMonthlyRp} bp={l.change.changeBp} suffix="/mois" className="text-sm" />
                ) : (
                  <p className="text-sm text-muted">Inconnue</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Meilleure offre</p>
                {l.potentialSavingRp !== null && l.potentialSavingRp > 0 ? (
                  <Saving rp={l.potentialSavingRp} className="text-sm" />
                ) : l.best ? (
                  <p className="text-sm text-muted">Déjà au mieux</p>
                ) : (
                  <p className="text-sm text-muted">—</p>
                )}
              </div>
            </div>
            {l.chosen && (
              <p className="num mt-2 text-sm">
                Choix : <strong>{l.line.chosenLabel}</strong>, franchise {l.line.chosenFranchiseChf} · <Chf rp={l.line.chosenMonthlyRp ?? 0} />
                /mois
              </p>
            )}
            {(l.ageClassWarning || l.alerts.length > 0 || l.activeLca.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {l.ageClassWarning && <Badge tone="up">Change de classe d&apos;âge</Badge>}
                {l.activeLca.length > 0 && <Badge tone="lca">LCA chez la caisse</Badge>}
                {l.alerts.map((a) => (
                  <Badge key={a} tone="neutral">
                    {a.length > 48 ? `${a.slice(0, 46)}…` : a}
                  </Badge>
                ))}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RitualActions({ overview }: { overview: ReviewOverview }) {
  const year = overview.review.targetYear;
  const hasSwitch = overview.lines.some((l) => l.line.decision === "SWITCH");
  return (
    <div className="flex flex-col gap-2">
      {hasSwitch && (
        <ButtonLink href={`/rituel/${year}/lettres`} className="w-full">
          Lettres de résiliation et suivi
        </ButtonLink>
      )}
      <ButtonLink href={`/rituel/${year}`} variant="secondary" className="w-full">
        Détail du rituel {year}
      </ButtonLink>
    </div>
  );
}
