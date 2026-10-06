"use client";

import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { importYearAction } from "@/app/actions/data";
import { savePolicyAction, tariffOptionsAction } from "@/app/actions/household";
import type { TariffOptions } from "@/application/tariffs";
import { domicileLabel, type Domicile } from "@/domain/domicile";
import { MODEL_LABEL, MODEL_TYPES, displayTariffLabel, type ModelType } from "@/domain/lamal";
import { formatChf, rpToInput } from "@/domain/money";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Checkbox, Field, FormError, Input, Select } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";
import { CommunePicker } from "./commune-picker";

export interface PolicyDefaults {
  id?: number;
  coverageYear: number;
  insurerId: number | null;
  policyNumber: string | null;
  tariffCode: string | null;
  tariffLabel: string | null;
  modelType: string;
  franchiseChf: number;
  accident: boolean;
  billedMonthlyRp: number | null;
  /** Domicile au 1er janvier de l'année du contrat (l'adresse du foyer pour un nouveau contrat). */
  domicile: Domicile;
}

/**
 * Contrat LAMal d'une année. Quand les primes OFSP de l'année sont dans la base, il suffit de
 * choisir la caisse, le produit et la franchise : la prime officielle est reprise (et reste
 * modifiable si la police indique autre chose). Sinon, saisie manuelle depuis la police.
 */
export function PolicyForm({ personId, insurers, years, policy, onDone }: {
  personId: number;
  insurers: { id: number; name: string }[];
  years: number[];
  policy: PolicyDefaults;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(savePolicyAction, null);
  const [year, setYear] = useState(policy.coverageYear);
  const [insurerId, setInsurerId] = useState<number | null>(policy.insurerId);
  const [options, setOptions] = useState<TariffOptions | null>(null);
  const [tariffCode, setTariffCode] = useState(policy.tariffCode ?? "");
  const [franchise, setFranchise] = useState(policy.franchiseChf);
  const [accident, setAccident] = useState(policy.accident);
  const [modelType, setModelType] = useState(policy.modelType);
  const [label, setLabel] = useState(policy.tariffLabel ?? "");
  const [customPremium, setCustomPremium] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [loading, startLoading] = useTransition();
  const [importing, setImporting] = useState(false);
  const [editPlace, setEditPlace] = useState(false);
  const [place, setPlace] = useState({ canton: policy.domicile.canton, region: policy.domicile.region });
  const onPlace = useCallback((p: { canton: string; region: number }) => {
    setPlace((cur) => (cur.canton === p.canton && cur.region === p.region ? cur : p));
  }, []);

  useEffect(() => {
    if (!insurerId) return;
    startLoading(async () => setOptions(await tariffOptionsAction(personId, year, insurerId, place)));
  }, [personId, year, insurerId, importing, place]);

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  const selected = useMemo(() => options?.tariffs.find((t) => t.code === tariffCode) ?? null, [options, tariffCode]);
  const official = selected?.premiums[franchise]?.[accident ? 1 : 0] ?? null;
  const ofspMode = Boolean(options?.available && options.tariffs.length > 0);

  // Contrat existant dont la prime facturée diffère de la prime officielle : tant que la
  // sélection n'a pas changé, on garde la prime saisie.
  const inherited =
    !changed && policy.billedMonthlyRp !== null && official !== null && policy.billedMonthlyRp !== official
      ? rpToInput(policy.billedMonthlyRp)
      : null;
  const custom = customPremium ?? inherited;
  const premiumValue = custom ?? rpToInput(official ?? policy.billedMonthlyRp);
  const franchises = options?.franchises ?? [0, 100, 200, 300, 400, 500, 600, 1000, 1500, 2000, 2500];
  const fieldErrors = state?.fieldErrors ?? {};

  async function importYear() {
    setImporting(true);
    await importYearAction(year);
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const job = await (await fetch("/api/import", { cache: "no-store" })).json();
      if (!job.running) break;
    }
    setImporting(false);
    router.refresh();
  }

  return (
    <form action={action} className="space-y-4">
      {policy.id && <input type="hidden" name="id" value={policy.id} />}
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="tariffCode" value={ofspMode && selected ? tariffCode : ""} />
      <input type="hidden" name="billedMonthly" value={premiumValue} />
      {ofspMode && selected && (
        <>
          <input type="hidden" name="modelType" value={selected.modelType} />
          <input type="hidden" name="tariffLabel" value={selected.label} />
        </>
      )}

      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Field label="Année" htmlFor="coverageYear">
          <Select id="coverageYear" name="coverageYear" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Caisse-maladie" htmlFor="insurerId" error={fieldErrors.insurerId}>
          <Select id="insurerId" name="insurerId" required value={insurerId ?? ""} onChange={(e) => { setInsurerId(Number(e.target.value)); setTariffCode(""); setCustomPremium(null); setChanged(true); }}>
            <option value="" disabled>
              Choisir…
            </option>
            {insurers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {editPlace ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Domicile au 1er janvier {year}</p>
          <CommunePicker place={{ postalCode: "", ...policy.domicile }} onPlace={onPlace} />
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
          <MapPin aria-hidden className="size-4 shrink-0" /> Domicile au 1er janvier {year} : {domicileLabel(policy.domicile)}
          <button type="button" className="min-h-11 text-primary underline-offset-2 hover:underline" onClick={() => setEditPlace(true)}>
            Modifier
          </button>
          <input type="hidden" name="canton" value={policy.domicile.canton} />
          <input type="hidden" name="region" value={policy.domicile.region} />
          <input type="hidden" name="commune" value={policy.domicile.commune} />
          <input type="hidden" name="bfsNumber" value={policy.domicile.bfsNumber ?? ""} />
        </p>
      )}

      {insurerId && loading && !options && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Recherche des produits {year}…
        </p>
      )}

      {ofspMode ? (
        <Field label="Produit" htmlFor="tariffPick" error={fieldErrors.modelType}>
          <Select id="tariffPick" required value={tariffCode} onChange={(e) => { setTariffCode(e.target.value); setCustomPremium(null); setChanged(true); }}>
            <option value="" disabled>
              Choisir le produit…
            </option>
            {options!.tariffs.map((t) => (
              <option key={t.code} value={t.code}>
                {displayTariffLabel(t.label, t.modelType)}
                {t.modelType !== "STANDARD" ? ` · ${MODEL_LABEL[t.modelType]}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        insurerId &&
        options && (
          <div className="space-y-3">
            <Alert tone="info" title={`Primes ${year} absentes de la base`}>
              Importez-les pour remplir le contrat automatiquement, ou saisissez-le depuis votre police.
            </Alert>
            {year >= 2015 && (
              <Button type="button" variant="secondary" size="sm" onClick={importYear} disabled={importing}>
                {importing && <Loader2 aria-hidden className="size-4 animate-spin" />}
                {importing ? "Import en cours (1 à 3 min)…" : `Importer les primes ${year}`}
              </Button>
            )}
            <Field label="Modèle" htmlFor="modelType">
              <Select id="modelType" name="modelType" value={modelType} onChange={(e) => setModelType(e.target.value)}>
                {MODEL_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABEL[m as ModelType]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nom du produit (facultatif)" htmlFor="tariffLabel">
              <Input id="tariffLabel" name="tariffLabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Telmed, Médecin de famille…" />
            </Field>
          </div>
        )
      )}

      <div className="grid grid-cols-2 items-end gap-3">
        <Field label="Franchise" htmlFor="franchiseChf">
          <Select id="franchiseChf" name="franchiseChf" value={franchise} onChange={(e) => { setFranchise(Number(e.target.value)); setCustomPremium(null); setChanged(true); }}>
            {franchises.map((f) => (
              <option key={f} value={f}>
                CHF {f}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox name="accident" checked={accident} onChange={(e) => { setAccident(e.target.checked); setCustomPremium(null); setChanged(true); }} label="Avec accident" className="pb-1" />
      </div>

      {ofspMode && selected && official !== null && custom === null ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-saving-soft/60 p-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm text-saving">
              <CheckCircle2 aria-hidden className="size-4" /> Prime officielle OFSP
            </p>
            <p className="text-xl font-bold tabular">
              {formatChf(official)}
              <span className="text-sm font-normal text-muted">/mois</span>
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCustomPremium(rpToInput(official))}>
            Ma prime diffère
          </Button>
        </div>
      ) : (
        (custom !== null || !ofspMode) && (
          <Field
            label="Prime mensuelle facturée (CHF)"
            htmlFor="billedMonthlyInput"
            error={fieldErrors.billedMonthlyRp}
            hint={official !== null ? `Prime officielle : ${formatChf(official)}. Montant brut de la police, avant redistribution CO2.` : "Montant brut figurant sur la police, avant redistribution CO2."}
          >
            <Input
              id="billedMonthlyInput"
              inputMode="decimal"
              required
              value={custom ?? premiumValue}
              onChange={(e) => setCustomPremium(e.target.value)}
            />
          </Field>
        )
      )}
      {ofspMode && selected && official === null && (
        <p className="text-sm text-increase">Ce produit n&apos;existe pas avec cette franchise ou cette couverture accident.</p>
      )}

      <details className="rounded-xl border border-border px-3" open={Boolean(policy.policyNumber)}>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">N° d&apos;assuré (pour les lettres)</summary>
        <div className="pb-3">
          <Input id="policyNumber" name="policyNumber" aria-label="Numéro d'assuré" defaultValue={policy.policyNumber ?? ""} autoComplete="off" placeholder="Sur la carte d'assuré ou la police" />
        </div>
      </details>

      <FormError message={state?.error} />
      <SubmitButton block disabled={ofspMode && (!selected || official === null) && custom === null}>
        Enregistrer le contrat
      </SubmitButton>
    </form>
  );
}
