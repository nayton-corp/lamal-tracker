"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { savePolicyAction, tariffOptionsAction } from "@/app/actions/household";
import type { TariffOptions } from "@/application/tariffs";
import { MODEL_LABEL, MODEL_TYPES, type ModelType } from "@/domain/lamal";
import { formatChf } from "@/domain/money";
import { Alert } from "@/ui/alert";
import { Checkbox, Field, FormError, Input, Select } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

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
}

export function PolicyForm({ personId, insurers, years, policy, onDone }: {
  personId: number;
  insurers: { id: number; name: string }[];
  years: number[];
  policy: PolicyDefaults;
  onDone?: () => void;
}) {
  const [state, action] = useActionState(savePolicyAction, null);
  const [year, setYear] = useState(policy.coverageYear);
  const [insurerId, setInsurerId] = useState<number | null>(policy.insurerId);
  const [options, setOptions] = useState<TariffOptions | null>(null);
  const [tariffCode, setTariffCode] = useState(policy.tariffCode ?? "");
  const [franchise, setFranchise] = useState(policy.franchiseChf);
  const [accident, setAccident] = useState(policy.accident);
  const [modelType, setModelType] = useState(policy.modelType);
  const [label, setLabel] = useState(policy.tariffLabel ?? "");
  const [billed, setBilled] = useState(policy.billedMonthlyRp === null ? "" : (policy.billedMonthlyRp / 100).toFixed(2));
  const [billedTouched, setBilledTouched] = useState(policy.billedMonthlyRp !== null);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    if (!insurerId) return;
    startLoading(async () => setOptions(await tariffOptionsAction(personId, year, insurerId)));
  }, [personId, year, insurerId]);

  const selected = useMemo(() => options?.tariffs.find((t) => t.code === tariffCode) ?? null, [options, tariffCode]);
  const suggested = selected?.premiums[franchise]?.[accident ? 1 : 0] ?? null;

  /** Après un changement de tarif, franchise ou accident : reprend la prime officielle si l'utilisateur ne l'a pas saisie. */
  function choose(next: { code?: string; franchise?: number; accident?: boolean }) {
    const code = next.code ?? tariffCode;
    const f = next.franchise ?? franchise;
    const acc = next.accident ?? accident;
    const tariff = options?.tariffs.find((t) => t.code === code);
    if (tariff && next.code !== undefined) {
      setModelType(tariff.modelType);
      setLabel(tariff.label);
    }
    const premium = tariff?.premiums[f]?.[acc ? 1 : 0];
    if (premium != null) {
      setBilled((premium / 100).toFixed(2));
      setBilledTouched(false);
    }
  }

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  const franchises = options?.franchises ?? [300, 500, 1000, 1500, 2000, 2500, 0, 100, 200, 400, 600].sort((a, b) => a - b);
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {policy.id && <input type="hidden" name="id" value={policy.id} />}
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="tariffCode" value={selected ? tariffCode : ""} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Année" htmlFor="coverageYear">
          <Select id="coverageYear" name="coverageYear" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="N° d'assuré" htmlFor="policyNumber">
          <Input id="policyNumber" name="policyNumber" defaultValue={policy.policyNumber ?? ""} autoComplete="off" />
        </Field>
      </div>
      <Field label="Caisse-maladie (LAMal)" htmlFor="insurerId" error={fe.insurerId}>
        <Select id="insurerId" name="insurerId" required value={insurerId ?? ""} onChange={(e) => { setInsurerId(Number(e.target.value)); setTariffCode(""); }}>
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

      {options?.available && options.tariffs.length > 0 ? (
        <Field label="Tarif (données OFSP)" htmlFor="tariffPick" hint="Choisir le tarif remplit le modèle et la prime officielle ; vous pouvez ajuster la prime facturée.">
          <Select id="tariffPick" value={tariffCode} onChange={(e) => { setTariffCode(e.target.value); choose({ code: e.target.value }); }}>
            <option value="">Saisie manuelle</option>
            {options.tariffs.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label} · {MODEL_LABEL[t.modelType]}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        insurerId &&
        !loading && (
          <p className="text-sm text-muted">
            Primes {year} pas encore importées pour cette caisse : saisie manuelle depuis votre police.
          </p>
        )
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Modèle" htmlFor="modelType">
          <Select id="modelType" name="modelType" value={modelType} onChange={(e) => setModelType(e.target.value)} disabled={Boolean(selected)}>
            {MODEL_TYPES.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABEL[m as ModelType]}
              </option>
            ))}
          </Select>
          {selected && <input type="hidden" name="modelType" value={modelType} />}
        </Field>
        <Field label="Franchise (CHF)" htmlFor="franchiseChf">
          <Select id="franchiseChf" name="franchiseChf" value={franchise} onChange={(e) => { setFranchise(Number(e.target.value)); if (!billedTouched) choose({ franchise: Number(e.target.value) }); }}>
            {franchises.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Nom du produit" htmlFor="tariffLabel">
        <Input id="tariffLabel" name="tariffLabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Telmed, Médecin de famille…" />
      </Field>
      <Checkbox name="accident" checked={accident} onChange={(e) => { setAccident(e.target.checked); if (!billedTouched) choose({ accident: e.target.checked }); }} label="Couverture accident incluse" />
      <Field
        label="Prime mensuelle facturée (CHF)"
        htmlFor="billedMonthly"
        error={fe.billedMonthlyRp}
        hint={suggested !== null ? `Prime officielle OFSP : ${formatChf(suggested)} (avant redistribution CO2).` : "Montant brut figurant sur la police, avant redistribution CO2."}
      >
        <Input id="billedMonthly" name="billedMonthly" inputMode="decimal" required value={billed} onChange={(e) => { setBilled(e.target.value); setBilledTouched(true); }} />
      </Field>
      <FormError message={state?.error} />
      {state?.ok && <Alert tone="success" title={state.ok} />}
      <SubmitButton block>Enregistrer le contrat</SubmitButton>
    </form>
  );
}
