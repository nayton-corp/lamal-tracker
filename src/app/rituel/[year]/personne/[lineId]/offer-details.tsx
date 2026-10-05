import { ExternalLink } from "lucide-react";
import type { DetailedOffer, InsurerCard } from "@/application/compare";
import { MODEL_DETAILS, MODEL_LABEL } from "@/domain/lamal";
import { Badge } from "@/ui/badge";
import { Chf } from "@/ui/money";
import { formatPermille } from "@/domain/money";

const LEVEL_WORD = { LOW: "bas", MID: "moyen", HIGH: "élevé" } as const;

/** Portrait public de la caisse : solidité, frais, évolution des primes dans la région. */
export function InsurerFacts({ name, card }: { name: string; card: InsurerCard | undefined }) {
  const p = card?.profile;
  if (!p && !card?.website && !card?.phone) return null;
  const trendText = p?.trend
    ? `${formatPermille(p.trend.insurerPermille)} par an de ${p.trend.fromYear} à ${p.trend.toYear} (marché ${formatPermille(p.trend.marketPermille)})`
    : null;
  return (
    <div className="space-y-2 rounded-xl bg-surface-2 p-3">
      <p className="font-medium">La caisse {name}</p>
      {p && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {p.insured !== null && (
            <>
              <dt className="text-muted">Assurés</dt>
              <dd className="text-right tabular">{p.insured.toLocaleString("fr-CH")}</dd>
            </>
          )}
          {p.reservesMonths !== null && (
            <>
              <dt className="text-muted">Réserves</dt>
              <dd className="text-right">
                {p.reservesMonths.toLocaleString("fr-CH")} mois de primes{" "}
                <Badge tone={p.reservesLevel === "LOW" ? "increase" : p.reservesLevel === "HIGH" ? "saving" : "neutral"} className="text-xs">
                  {p.reservesLevel === "LOW" ? "plutôt faibles" : p.reservesLevel === "HIGH" ? "solides" : "dans la moyenne"}
                </Badge>
              </dd>
            </>
          )}
          {p.adminPerInsuredRp !== null && (
            <>
              <dt className="text-muted">Frais administratifs</dt>
              <dd className="text-right">
                <Chf rp={p.adminPerInsuredRp} whole /> par assuré et par an
                {p.adminLevel && <span className="text-muted"> ({LEVEL_WORD[p.adminLevel]})</span>}
              </dd>
            </>
          )}
          {trendText && (
            <>
              <dt className="text-muted">Primes</dt>
              <dd className="text-right">
                {trendText}{" "}
                {p.trendLevel !== "SIMILAR" && (
                  <Badge tone={p.trendLevel === "BETTER" ? "saving" : "increase"} className="text-xs">
                    {p.trendLevel === "BETTER" ? "hausses modérées" : "hausses fortes"}
                  </Badge>
                )}
              </dd>
            </>
          )}
        </dl>
      )}
      {p?.year && <p className="text-xs text-muted">Comptes {p.year} publiés par l&apos;OFSP ; primes du modèle standard dans votre région.</p>}
      <div className="flex flex-wrap gap-x-4">
        {card?.website && (
          <a href={card.website} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-primary">
            Site de la caisse <ExternalLink aria-hidden className="size-4" />
          </a>
        )}
        {card?.phone && (
          <a href={`tel:${card.phone.replace(/\s/g, "")}`} className="inline-flex min-h-11 items-center text-primary">
            {card.phone}
          </a>
        )}
      </div>
    </div>
  );
}

/** Coût selon trois années types, puis le détail de l'année attendue. */
export function OfferCosts({ offer: o, healthCostsRp }: { offer: DetailedOffer; healthCostsRp: number }) {
  return (
    <div className="space-y-2">
      <p className="font-medium">Ce que vous paieriez sur l&apos;année</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="text-xs text-muted">Sans frais de santé</p>
          <Chf rp={o.scenarios.noCostsRp} whole className="font-semibold" />
        </div>
        <div className="rounded-xl bg-primary-soft p-2">
          <p className="text-xs text-muted">Vos frais attendus (<Chf rp={healthCostsRp} whole />)</p>
          <Chf rp={o.scenarios.expectedRp} whole className="font-semibold" />
        </div>
        <div className="rounded-xl bg-surface-2 p-2">
          <p className="text-xs text-muted">Année chargée (maximum)</p>
          <Chf rp={o.scenarios.worstRp} whole className="font-semibold" />
        </div>
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-primary">Détail du calcul</summary>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-muted">Prime brute / an</dt>
          <dd className="text-right tabular"><Chf rp={o.cost.grossPremiumRp} /></dd>
          <dt className="text-muted">Redistribution CO2</dt>
          <dd className="text-right tabular">−<Chf rp={o.cost.co2Rp} /></dd>
          <dt className="text-muted">Franchise payée</dt>
          <dd className="text-right tabular"><Chf rp={o.cost.franchisePartRp} /></dd>
          <dt className="text-muted">Quote-part (10 %)</dt>
          <dd className="text-right tabular"><Chf rp={o.cost.coinsurancePartRp} /></dd>
          <dt className="font-medium">Coût total attendu</dt>
          <dd className="text-right font-semibold tabular"><Chf rp={o.cost.totalRp} /></dd>
        </dl>
        <p className="mt-1 text-xs text-muted">Année chargée : prime nette, franchise de CHF {o.franchiseChf} et quote-part maximale. S&apos;y ajoute la contribution hospitalière de CHF 15 par jour d&apos;hôpital.</p>
      </details>
    </div>
  );
}

export function ModelBlock({ offer: o }: { offer: DetailedOffer }) {
  const d = MODEL_DETAILS[o.modelType];
  const discount = o.standardMonthlyRp && o.modelType !== "STANDARD" ? Math.round(((o.standardMonthlyRp - o.monthlyPremiumRp) * 100) / o.standardMonthlyRp) : null;
  return (
    <div className="space-y-1">
      <p className="font-medium">
        Le modèle : {MODEL_LABEL[o.modelType]}
        {discount !== null && discount > 0 && <span className="font-normal text-muted"> · {discount} % moins cher que le standard de la caisse</span>}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">Premier recours</dt>
        <dd>{d.firstContact}</dd>
        <dt className="text-muted">Accès direct</dt>
        <dd>{d.exceptions}</dd>
        <dt className="text-muted">Règle</dt>
        <dd>{d.rule}</dd>
        <dt className="text-muted">Pour qui</dt>
        <dd>{d.goodFor}</dd>
      </dl>
    </div>
  );
}
