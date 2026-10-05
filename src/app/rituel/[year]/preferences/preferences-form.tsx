"use client";

import { ChevronDown, PiggyBank, Repeat, Stethoscope, UserRound } from "lucide-react";
import { useActionState, useState } from "react";
import { savePreferencesAction } from "@/app/actions/journey";
import { MODEL_HINT, MODEL_LABEL, type ModelType } from "@/domain/lamal";
import { formatChf, rpToInput } from "@/domain/money";
import { STRATEGY_INFO, USAGE_INFO, USAGE_PROFILES, usageFor, type Strategy, type UsageProfile } from "@/domain/strategy";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { FormError, Input } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

export interface StrategyChoice {
  strategy: Strategy;
  /** Économie annuelle du foyer avec les réglages par défaut (null si un renouvellement manque). */
  annualSavingsRp: number | null;
  persons: { lineId: number; firstName: string; offer: { summary: string; monthlyRp: number } | null }[];
}

export interface PreferencesPerson {
  lineId: number;
  firstName: string;
  /** Contrat actuel, en une ligne. */
  current: string;
  currentModel: ModelType;
  currentFranchise: number;
  franchises: number[];
  franchise: number | null;
  models: ModelType[];
  /** Réglages proposés par chaque stratégie, appliqués quand on en change. */
  defaults: Record<Strategy, { franchiseChf: number | null; models: ModelType[] }>;
  healthCostsRp: number;
  doctorName: string | null;
  accident: boolean;
  transition: string | null;
}

const PICKABLE: ModelType[] = ["TELMED", "PRAXIS", "PHARMACY", "FLEX", "STANDARD"];

const chip = (active: boolean) =>
  cn(
    "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
    active ? "border-primary bg-primary text-on-primary" : "border-border bg-surface hover:bg-surface-2",
  );

const ICONS: Record<Strategy, typeof PiggyBank> = { ECONOMY: PiggyBank, KEEP: Repeat };

/**
 * Préférences du rituel : la stratégie du foyer en tête, puis par personne la fréquence des soins
 * (pour le coût réel) et, repliés, la franchise, les modèles et le médecin. Changer de stratégie
 * remet franchise et modèles aux réglages qu'elle propose.
 */
export function PreferencesForm({ year, reviewId, strategy: initial, choices, persons }: {
  year: number;
  reviewId: number;
  strategy: Strategy;
  choices: StrategyChoice[];
  persons: PreferencesPerson[];
}) {
  const [state, action] = useActionState(savePreferencesAction, null);
  const [strategy, setStrategy] = useState<Strategy>(initial);
  const several = persons.length > 1;
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="reviewId" value={reviewId} />
      <fieldset className="space-y-3">
        <legend className="mb-1 text-lg font-semibold">Qu&apos;est-ce qui compte le plus{several ? " pour le foyer" : ""} ?</legend>
        {choices.map((c) => (
          <StrategyCard key={c.strategy} choice={c} active={strategy === c.strategy} several={several} onPick={() => setStrategy(c.strategy)} />
        ))}
      </fieldset>
      <section className="space-y-4" aria-label="Besoins">
        {persons.map((p) => (
          <PersonNeeds key={p.lineId} p={p} several={several} strategy={strategy} />
        ))}
      </section>
      <FormError message={state?.error} />
      <div className="sticky bottom-20 z-30 lg:bottom-6">
        <SubmitButton block size="lg" className="shadow-lg" pendingLabel="Recherche des offres…">
          Comparer les offres
        </SubmitButton>
      </div>
    </form>
  );
}

function StrategyCard({ choice: c, active, several, onPick }: { choice: StrategyChoice; active: boolean; several: boolean; onPick: () => void }) {
  const info = STRATEGY_INFO[c.strategy];
  const Icon = ICONS[c.strategy];
  return (
    <label className={cn("block cursor-pointer space-y-3 rounded-2xl border-2 bg-surface p-4 shadow-card has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", active ? "border-primary" : "border-border")}>
      <span className="flex items-start gap-3">
        <input type="radio" name="strategy" value={c.strategy} checked={active} onChange={onPick} className="sr-only" />
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", active ? "bg-primary text-on-primary" : "bg-primary-soft text-primary")}>
          <Icon aria-hidden className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">{info.label}</span>
          <span className="block text-sm text-muted">{info.tagline}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-xs text-muted">Économie</span>
          <span className={cn("block text-lg font-bold tabular", (c.annualSavingsRp ?? 0) > 0 ? "text-saving" : "text-muted")}>
            {c.annualSavingsRp === null ? "—" : c.annualSavingsRp > 0 ? `${formatChf(c.annualSavingsRp, { whole: true })}/an` : "aucune"}
          </span>
        </span>
      </span>
      {active && (
        <ul className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
          {c.persons.map((p) => (
            <li key={p.lineId} className="flex justify-between gap-2">
              <span className="min-w-0">
                {several && <strong>{p.firstName} : </strong>}
                {p.offer ? p.offer.summary : "aucune offre"}
              </span>
              {p.offer && <span className="shrink-0 tabular">{formatChf(p.offer.monthlyRp)}/mois</span>}
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}

function PersonNeeds({ p, several, strategy }: { p: PreferencesPerson; several: boolean; strategy: Strategy }) {
  const [franchise, setFranchise] = useState<number | null>(p.franchise);
  const [models, setModels] = useState<Set<ModelType>>(new Set(p.models));
  // Changer de stratégie remet franchise et modèles à ses réglages (mise à jour pendant le rendu).
  const [appliedStrategy, setAppliedStrategy] = useState(strategy);
  if (appliedStrategy !== strategy) {
    setAppliedStrategy(strategy);
    setFranchise(p.defaults[strategy].franchiseChf);
    setModels(new Set(p.defaults[strategy].models));
  }
  const [usage, setUsage] = useState<UsageProfile | "CUSTOM">(usageFor(p.healthCostsRp) ?? "CUSTOM");
  const [custom, setCustom] = useState(rpToInput(p.healthCostsRp, 0));
  const healthChf = usage === "CUSTOM" ? custom : rpToInput(USAGE_INFO[usage].healthCostsRp, 0);
  const needsDoctor = models.size === 0 || models.has("PRAXIS") || models.has("FLEX");
  const toggle = (m: ModelType) =>
    setModels((s) => {
      const next = new Set(s);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  const id = p.lineId;

  return (
    <Card className="space-y-5">
      <input type="hidden" name="lineId" value={id} />
      <input type="hidden" name={`franchise-${id}`} value={franchise ?? "auto"} />
      <input type="hidden" name={`healthCosts-${id}`} value={healthChf} />
      {[...models].map((m) => (
        <input key={m} type="hidden" name={`models-${id}`} value={m} />
      ))}

      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <UserRound aria-hidden className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">{several ? p.firstName : "Votre suivi médical"}</h2>
          <p className="text-sm text-muted">Aujourd&apos;hui : {p.current}</p>
          {p.transition && <p className="text-sm text-info">{p.transition}</p>}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="font-medium">À quelle fréquence {several ? `${p.firstName} va` : "allez-vous"} chez le médecin ?</legend>
        <p className="text-sm text-muted">Sert à calculer le coût réel de l&apos;année : prime, franchise et quote-part.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {USAGE_PROFILES.map((u) => (
            <label key={u} className={cn("flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3", usage === u ? "border-primary bg-primary-soft/50" : "border-border")}>
              <input type="radio" name={`usage-${id}`} className="mt-1 size-5 accent-[var(--primary)]" checked={usage === u} onChange={() => setUsage(u)} />
              <span>
                <span className="block font-medium">{USAGE_INFO[u].label}</span>
                <span className="block text-sm text-muted">
                  {USAGE_INFO[u].example} Environ {formatChf(USAGE_INFO[u].healthCostsRp, { whole: true })} de frais par an.
                </span>
              </span>
            </label>
          ))}
          <label className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 sm:col-span-2", usage === "CUSTOM" ? "border-primary bg-primary-soft/50" : "border-border")}>
            <input type="radio" name={`usage-${id}`} className="size-5 accent-[var(--primary)]" checked={usage === "CUSTOM"} onChange={() => setUsage("CUSTOM")} />
            <span className="flex-1 font-medium">Je connais mes frais annuels</span>
            <Input aria-label={`Frais annuels de ${p.firstName} (CHF)`} inputMode="numeric" className="w-28" value={custom} onFocus={() => setUsage("CUSTOM")} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))} />
          </label>
        </div>
      </fieldset>

      <details className="group rounded-xl border border-border">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Affiner</span>
            <span className="block text-sm text-muted">
              {franchise === null ? "Franchise la plus avantageuse" : `Franchise ${franchise}`} ·{" "}
              {models.size === 0 ? "tous les modèles" : [...models].map((m) => MODEL_LABEL[m]).join(", ")}
            </span>
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-5 border-t border-border p-3">
      <fieldset className="space-y-2">
        <legend className="font-medium">Franchise souhaitée</legend>
        <div className="flex flex-wrap gap-2">
          <label className={chip(franchise === null)}>
            <input type="radio" className="sr-only" name={`franchise-pick-${id}`} checked={franchise === null} onChange={() => setFranchise(null)} />
            La plus avantageuse
          </label>
          {p.franchises.map((f) => (
            <label key={f} className={chip(franchise === f)}>
              <input type="radio" className="sr-only" name={`franchise-pick-${id}`} checked={franchise === f} onChange={() => setFranchise(f)} />
              {f}
              {f === p.currentFranchise && <span className="text-xs opacity-80">(actuelle)</span>}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted">
          {franchise === null ? "L'app compare toutes les franchises et retient celle qui coûte le moins sur l'année avec vos frais." : `Seules les offres avec une franchise de CHF ${franchise} sont comparées.`}
        </p>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="font-medium">Modèles de soins acceptés</legend>
        <div className="space-y-2">
          {PICKABLE.map((m) => (
            <label key={m} className={cn("flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3", models.has(m) ? "border-primary bg-primary-soft/50" : "border-border")}>
              <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={models.has(m)} onChange={() => toggle(m)} />
              <span>
                <span className="block font-medium">
                  {MODEL_LABEL[m]}
                  {m === p.currentModel && <span className="ml-1 text-xs font-normal text-muted">(actuel)</span>}
                </span>
                <span className="block text-sm text-muted">{MODEL_HINT[m]}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="text-sm text-muted">{models.size === 0 ? "Aucun coché : tous les modèles sont comparés." : `${models.size} modèle(s) comparé(s).`}</p>
      </fieldset>

      {needsDoctor && (
        <label className="block space-y-1.5">
          <span className="flex items-center gap-2 font-medium">
            <Stethoscope aria-hidden className="size-4" /> Médecin de famille (facultatif)
          </span>
          <Input name={`doctor-${id}`} defaultValue={p.doctorName ?? ""} placeholder="Dr Martin, Lausanne" />
          <span className="block text-sm text-muted">Avec un modèle médecin de famille, vérifiez qu&apos;il figure sur la liste de la nouvelle caisse : l&apos;app vous le rappellera.</span>
        </label>
      )}
      <p className="text-xs text-muted">
        Couverture accidents : {p.accident ? "comprise" : "exclue (couverte par l'employeur)"}, comme aujourd&apos;hui.
      </p>
        </div>
      </details>
      {!needsDoctor && p.doctorName && <input type="hidden" name={`doctor-${id}`} value={p.doctorName} />}
    </Card>
  );
}
