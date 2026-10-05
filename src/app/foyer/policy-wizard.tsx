"use client";

import { ArrowLeft, Check, CheckCircle2, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { savePolicyAction, tariffOptionsAction } from "@/app/actions/household";
import type { TariffOptions } from "@/application/tariffs";
import { MODEL_HINT, MODEL_LABEL, MODEL_TYPES, displayTariffLabel, type ModelType } from "@/domain/lamal";
import { formatChf, rpToInput } from "@/domain/money";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Checkbox, Field, FormError, Input, Select } from "@/ui/form";
import { foldForSearch } from "@/domain/text";

const STEPS = ["Caisse", "Modèle", "Franchise", "Prime"] as const;

/**
 * Saisie guidée d'un contrat, une question à la fois : caisse, modèle, franchise, puis la prime
 * officielle retrouvée (modifiable si la police indique autre chose).
 */
export function PolicyWizard({ personId, personName, year, insurers, employed, onDone }: {
  personId: number;
  personName: string;
  year: number;
  insurers: { id: number; name: string }[];
  /** Employé·e ≥ 8 h/semaine : accident couvert par l'employeur, proposé exclu d'office. */
  employed: boolean;
  onDone?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [insurerId, setInsurerId] = useState<number | null>(null);
  const [options, setOptions] = useState<TariffOptions | null>(null);
  const [model, setModel] = useState<ModelType | null>(null);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [franchise, setFranchise] = useState<number | null>(null);
  const [accident, setAccident] = useState(!employed);
  const [premium, setPremium] = useState<string | null>(null);
  const [policyNumber, setPolicyNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!insurerId) return;
    startLoading(async () => setOptions(await tariffOptionsAction(personId, year, insurerId)));
  }, [personId, year, insurerId]);

  const filtered = useMemo(() => {
    const q = foldForSearch(query.trim());
    return q ? insurers.filter((i) => foldForSearch(i.name).includes(q)) : insurers;
  }, [insurers, query]);
  const official = options?.available && options.tariffs.length > 0;
  const models = official ? MODEL_TYPES.filter((m) => options!.tariffs.some((t) => t.modelType === m)) : MODEL_TYPES;
  const products = official && model ? options!.tariffs.filter((t) => t.modelType === model) : [];
  const product = products.find((t) => t.code === code) ?? (products.length === 1 ? products[0]! : null);
  const officialRp = product && franchise !== null ? product.premiums[franchise]?.[accident ? 1 : 0] ?? null : null;
  const franchises = options?.franchises ?? [];
  const premiumValue = premium ?? rpToInput(officialRp);

  function pickModel(m: ModelType) {
    setModel(m);
    const list = official ? options!.tariffs.filter((t) => t.modelType === m) : [];
    setCode(list.length === 1 ? list[0]!.code : "");
    setPremium(null);
  }

  function save() {
    const form = new FormData();
    form.set("personId", String(personId));
    form.set("coverageYear", String(year));
    form.set("insurerId", String(insurerId));
    form.set("modelType", model ?? "STANDARD");
    form.set("tariffCode", product?.code ?? "");
    form.set("tariffLabel", product?.label ?? label);
    form.set("franchiseChf", String(franchise));
    if (accident) form.set("accident", "on");
    form.set("billedMonthly", premiumValue);
    form.set("policyNumber", policyNumber);
    setError(null);
    startSaving(async () => {
      const res = await savePolicyAction(null, form);
      if (res?.error) setError(res.error);
      else onDone?.();
    });
  }

  const canNext = [insurerId !== null, model !== null && (!official || product !== null), franchise !== null, Boolean(premiumValue)][step];

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-4 gap-1" aria-label={`Contrat ${year} de ${personName}`}>
        {STEPS.map((s, i) => (
          <li key={s} className="space-y-1 text-center text-xs">
            <span className={cn("block h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-surface-2")} aria-hidden />
            <span className={i === step ? "font-semibold text-foreground" : "text-muted"}>{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Chez quelle caisse est {personName} en {year} ?</legend>
          <label className="relative block">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher : Helsana, CSS, Assura…" className="pl-9" aria-label="Rechercher une caisse" />
          </label>
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
            {filtered.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  aria-pressed={insurerId === i.id}
                  onClick={() => { setInsurerId(i.id); setOptions(null); setModel(null); setCode(""); setFranchise(null); setPremium(null); }}
                  className={cn("flex min-h-11 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-left text-sm", insurerId === i.id ? "bg-primary text-on-primary" : "hover:bg-surface-2")}
                >
                  {i.name}
                  {insurerId === i.id && <Check aria-hidden className="size-4" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="p-3 text-sm text-muted">Aucune caisse ne correspond.</li>}
          </ul>
        </fieldset>
      )}

      {step === 1 && (
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Quel modèle d&apos;assurance ?</legend>
          <p className="text-sm text-muted">Il figure sur la police : libre choix (standard), télémédecine, médecin de famille…</p>
          {loading && !options && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 aria-hidden className="size-4 animate-spin" /> Recherche des produits {year}…
            </p>
          )}
          <div className="space-y-2">
            {models.map((m) => (
              <label key={m} className={cn("flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3", model === m ? "border-primary bg-primary-soft/50" : "border-border")}>
                <input type="radio" name={`wizard-model-${personId}`} className="mt-1 size-5 accent-[var(--primary)]" checked={model === m} onChange={() => pickModel(m)} />
                <span>
                  <span className="block font-medium">{MODEL_LABEL[m]}</span>
                  <span className="block text-sm text-muted">{MODEL_HINT[m]}</span>
                </span>
              </label>
            ))}
          </div>
          {official && model && products.length > 1 && (
            <Field label="Nom du produit sur la police" htmlFor={`wizard-product-${personId}`}>
              <Select id={`wizard-product-${personId}`} value={code} onChange={(e) => { setCode(e.target.value); setPremium(null); }}>
                <option value="" disabled>
                  Choisir…
                </option>
                {products.map((t) => (
                  <option key={t.code} value={t.code}>
                    {displayTariffLabel(t.label, t.modelType)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {options && !official && (
            <Field label="Nom du produit (facultatif)" htmlFor={`wizard-label-${personId}`} hint={`Les primes ${year} ne sont pas dans l'app : vous indiquerez la prime de la police.`}>
              <Input id={`wizard-label-${personId}`} value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
          )}
        </fieldset>
      )}

      {step === 2 && (
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Quelle franchise ?</legend>
          <p className="text-sm text-muted">Le montant que vous payez vous-même chaque année avant que la caisse rembourse.</p>
          <div className="flex flex-wrap gap-2">
            {(franchises.length ? franchises : [300, 500, 1000, 1500, 2000, 2500]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={franchise === f}
                onClick={() => { setFranchise(f); setPremium(null); }}
                className={cn("min-h-11 cursor-pointer rounded-full border px-4 text-sm font-medium", franchise === f ? "border-primary bg-primary text-on-primary" : "border-border bg-surface hover:bg-surface-2")}
              >
                CHF {f}
              </button>
            ))}
          </div>
          <Checkbox checked={accident} onChange={(e) => { setAccident(e.target.checked); setPremium(null); }} label="Couverture accidents comprise" />
          <p className="text-xs text-muted">Si vous travaillez au moins 8 h par semaine, l&apos;employeur vous assure contre les accidents : la police l&apos;exclut alors souvent.</p>
        </fieldset>
      )}

      {step === 3 && (
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Votre prime mensuelle</legend>
          {officialRp !== null && premium === null ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-saving-soft/60 p-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm text-saving">
                  <CheckCircle2 aria-hidden className="size-4" /> Prime officielle OFSP
                </p>
                <p className="text-xl font-bold tabular">
                  {formatChf(officialRp)}
                  <span className="text-sm font-normal text-muted">/mois</span>
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPremium(rpToInput(officialRp))}>
                Ma prime diffère
              </Button>
            </div>
          ) : (
            <Field label="Prime mensuelle de la police (CHF)" htmlFor={`wizard-premium-${personId}`} hint="Montant brut, avant redistribution CO2.">
              <Input id={`wizard-premium-${personId}`} inputMode="decimal" value={premiumValue} onChange={(e) => setPremium(e.target.value)} />
            </Field>
          )}
          {product && franchise !== null && officialRp === null && <p className="text-sm text-increase">Ce produit n&apos;existe pas avec cette franchise : vérifiez la police ou saisissez la prime.</p>}
          <Field label="N° d'assuré (facultatif, pour les lettres)" htmlFor={`wizard-no-${personId}`}>
            <Input id={`wizard-no-${personId}`} value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} autoComplete="off" placeholder="Sur la carte d'assuré" />
          </Field>
          <FormError message={error} />
        </fieldset>
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
            <ArrowLeft aria-hidden className="size-4" /> Retour
          </Button>
        )}
        {step < 3 ? (
          <Button type="button" block disabled={!canNext} onClick={() => setStep(step + 1)}>
            Continuer
          </Button>
        ) : (
          <Button type="button" block disabled={!canNext || saving} onClick={save}>
            {saving ? "Enregistrement…" : "Enregistrer le contrat"}
          </Button>
        )}
      </div>
    </div>
  );
}
