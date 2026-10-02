import Link from "next/link";
import { chooseOfferAction } from "@/app/actions";
import { MODEL_SHORT } from "@/domain/insurance-model";
import { formatChf } from "@/domain/money";
import type { RankedOffer } from "@/domain/comparison/rank";
import { ActionForm, SubmitButton } from "../action-form";
import { Saving } from "../amount";
import { cn } from "../cn";
import { Badge } from "../primitives";

export function OfferCard({
  offer,
  lineId,
  highlight,
  isRenewal,
  isChosen,
  simulateHref,
  compareHref,
  compared,
  reasons,
  locked,
}: {
  offer: RankedOffer;
  lineId: number;
  highlight: boolean;
  isRenewal: boolean;
  isChosen: boolean;
  simulateHref: string;
  compareHref: string;
  compared: boolean;
  reasons: string[];
  locked: boolean;
}) {
  const t = offer.tariff;
  return (
    <article
      className={cn(
        "rounded-2xl border bg-surface p-4 shadow-card",
        isChosen ? "border-primary ring-2 ring-primary/30" : highlight ? "border-down/40" : "border-border",
      )}
      aria-label={`${t.insurerName}, ${t.tariffLabel}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "num inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            highlight ? "bg-down-soft text-down" : "bg-surface-2 text-muted",
          )}
        >
          {offer.rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{t.insurerName}</p>
          <p className="truncate text-sm text-muted">{t.tariffLabel}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge tone="info">{MODEL_SHORT[t.modelType]}</Badge>
            <Badge>Franchise {t.franchiseChf}</Badge>
            {isRenewal && <Badge tone="neutral">Ton renouvellement</Badge>}
            {isChosen && <Badge tone="down">Choisi</Badge>}
          </div>
        </div>
        <div className="text-right">
          <p className="num text-lg font-extrabold">{formatChf(t.monthlyPremiumRp)}</p>
          <p className="text-xs text-muted">par mois</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-xl bg-surface-2 p-2.5 text-sm">
        <div>
          <p className="text-xs text-muted">Coût total estimé</p>
          <p className="num font-semibold">{formatChf(offer.cost.totalRp, { compact: true })}/an</p>
        </div>
        <div>
          <p className="text-xs text-muted">vs renouvellement</p>
          {offer.annualSavingRp !== null ? <Saving rp={offer.annualSavingRp} /> : <p className="text-muted">—</p>}
        </div>
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-muted">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-2">
        {!locked && !isChosen && (
          <ActionForm action={chooseOfferAction} className="flex-1 gap-2" showSuccess={false}>
            <input type="hidden" name="lineId" value={lineId} />
            <input type="hidden" name="tariffId" value={t.id} />
            <SubmitButton className="min-h-11 w-full">{isRenewal ? "Je reste" : "Choisir"}</SubmitButton>
          </ActionForm>
        )}
        <Link
          href={simulateHref}
          scroll={false}
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          Franchises
        </Link>
        <Link
          href={compareHref}
          scroll={false}
          aria-pressed={compared}
          className={cn(
            "inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold",
            compared ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2",
          )}
        >
          {compared ? "✓ Comparé" : "Comparer"}
        </Link>
      </div>
    </article>
  );
}
