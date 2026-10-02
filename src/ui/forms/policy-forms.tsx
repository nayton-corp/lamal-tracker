"use client";

import { useActionState, useEffect, useState } from "react";
import { linkPolicyAction, saveLcaAction, savePolicyAction, type ActionState } from "@/app/actions";
import { LCA_CATEGORIES, LCA_CATEGORY_LABEL } from "@/domain/lca";
import { MODEL_LABEL, MODEL_TYPES } from "@/domain/insurance-model";
import { formatChf } from "@/domain/money";
import { ActionForm, FormField, SubmitButton } from "../action-form";
import { buttonClass, inputClass } from "../primitives";

interface TariffOption {
  id: number;
  tariffCode: string;
  tariffLabel: string;
  modelType: string;
  monthlyPremiumRp: number;
}

export interface PolicyFormProps {
  personId: number;
  year: number;
  franchises: number[];
  insurers: { id: number; name: string }[];
  hasDataset: boolean;
  values?: {
    insurerId: number;
    policyNumber: string;
    modelType: string;
    franchiseChf: number;
    accidentIncluded: boolean;
    billedMonthlyRp: number;
    premiumTariffId: number | null;
  };
}

interface SaveResult {
  policyId: number;
  confidence: string | null;
  proposed: { id: number; label: string; monthlyPremiumRp: number } | null;
  candidates: { id: number; label: string; monthlyPremiumRp: number }[];
}

export function PolicyForm({ personId, year, franchises, insurers, hasDataset, values }: PolicyFormProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(savePolicyAction, { ok: true });
  const [insurerId, setInsurerId] = useState(values?.insurerId ? String(values.insurerId) : "");
  const [franchise, setFranchise] = useState(String(values?.franchiseChf ?? franchises[franchises.length - 1] ?? 300));
  const [accident, setAccident] = useState(values?.accidentIncluded ?? false);
  const [model, setModel] = useState(values?.modelType ?? "STANDARD");
  const [premium, setPremium] = useState(values ? (values.billedMonthlyRp / 100).toFixed(2) : "");
  const [tariffs, setTariffs] = useState<TariffOption[]>([]);
  const [tariffId, setTariffId] = useState(values?.premiumTariffId ? String(values.premiumTariffId) : "");

  useEffect(() => {
    if (!hasDataset || !insurerId) return;
    const params = new URLSearchParams({ year: String(year), personId: String(personId), insurerId, franchise, accident: accident ? "1" : "0" });
    let cancelled = false;
    fetch(`/api/tariffs?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: TariffOption[]) => {
        if (!cancelled) setTariffs(list);
      })
      .catch(() => setTariffs([]));
    return () => {
      cancelled = true;
    };
  }, [hasDataset, insurerId, franchise, accident, year, personId]);

  const result = state.ok ? (state.data as SaveResult | undefined) : undefined;
  const error = (k: string) => (!state.ok ? state.fieldErrors?.[k] : undefined);

  function pickTariff(id: string) {
    setTariffId(id);
    const t = tariffs.find((x) => String(x.id) === id);
    if (t) {
      setModel(t.modelType);
      setPremium((t.monthlyPremiumRp / 100).toFixed(2));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="coverageYear" value={year} />
        <Labelled label="Caisse" error={error("insurerId")} htmlFor="insurerId">
          <select id="insurerId" name="insurerId" value={insurerId} onChange={(e) => setInsurerId(e.target.value)} className={inputClass} required>
            <option value="" disabled>
              Choisir la caisse
            </option>
            {insurers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Labelled>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Labelled label="Franchise" htmlFor="franchiseChf">
            <select id="franchiseChf" name="franchiseChf" value={franchise} onChange={(e) => setFranchise(e.target.value)} className={inputClass}>
              {franchises.map((f) => (
                <option key={f} value={f}>
                  CHF {f}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Prime mensuelle (CHF)" error={error("billedMonthlyRp")} htmlFor="billedMonthly">
            <input
              id="billedMonthly"
              name="billedMonthly"
              inputMode="decimal"
              value={premium}
              onChange={(e) => setPremium(e.target.value)}
              placeholder="412.35"
              className={inputClass}
            />
          </Labelled>
        </div>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3 text-sm">
          <input type="checkbox" name="accidentIncluded" checked={accident} onChange={(e) => setAccident(e.target.checked)} className="size-5" />
          Couverture accident incluse
        </label>
        {hasDataset && insurerId && (
          <Labelled
            label={`Produit dans les tarifs OFSP ${year}`}
            htmlFor="premiumTariffId"
            hint="Le choisir rend la comparaison exacte. Sinon, le rattachement se fait par la prime."
          >
            <select id="premiumTariffId" name="premiumTariffId" value={tariffId} onChange={(e) => pickTariff(e.target.value)} className={inputClass}>
              <option value="">Je ne sais pas</option>
              {tariffs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tariffLabel} · {formatChf(t.monthlyPremiumRp)}
                </option>
              ))}
            </select>
          </Labelled>
        )}
        <Labelled label="Modèle" htmlFor="modelType">
          <select id="modelType" name="modelType" value={model} onChange={(e) => setModel(e.target.value)} className={inputClass}>
            {MODEL_TYPES.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABEL[m]}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Numéro de police" htmlFor="policyNumber" hint="Indispensable pour la lettre de résiliation.">
          <input id="policyNumber" name="policyNumber" defaultValue={values?.policyNumber} className={inputClass} autoComplete="off" />
        </Labelled>
        <button type="submit" disabled={pending} className={buttonClass("primary", "w-full")}>
          {pending ? "Enregistrement…" : "Enregistrer le contrat"}
        </button>
        {state.message && (
          <p
            role={state.ok ? "status" : "alert"}
            className={state.ok ? "rounded-xl bg-down-soft px-3 py-2 text-sm text-down" : "rounded-xl bg-up-soft px-3 py-2 text-sm text-up"}
          >
            {state.message}
            {result?.confidence === "EXACT" && " Rattaché au tarif OFSP."}
          </p>
        )}
      </form>
      {result && result.confidence && result.confidence !== "EXACT" && (
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-sm font-semibold">Rattacher au tarif OFSP ?</p>
          <p className="mb-2 text-xs text-muted">
            {result.proposed ? "Tarif le plus proche de ta prime :" : "Aucun tarif ne correspond exactement à ta prime. Choisis le tien :"}
          </p>
          <ul className="flex flex-col gap-2">
            {[...(result.proposed ? [result.proposed] : []), ...result.candidates].map((c) => (
              <li key={c.id}>
                <form action={linkPolicyAction}>
                  <input type="hidden" name="policyId" value={result.policyId} />
                  <input type="hidden" name="tariffId" value={c.id} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <span>{c.label}</span>
                    <span className="num font-semibold">{formatChf(c.monthlyPremiumRp)}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Labelled({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs font-medium text-up">{error}</p>}
    </div>
  );
}

export function LcaForm({
  personId,
  insurers,
  values,
}: {
  personId: number;
  insurers: { id: number; name: string }[];
  values?: {
    id: number;
    insurerId: number;
    productName: string;
    category: string;
    policyNumber: string;
    startDate: string | null;
    minTermEnd: string | null;
    noticeMonths: number;
    bundledDiscount: boolean;
    status: string;
    monthlyPremiumRp: number | null;
  };
}) {
  return (
    <ActionForm action={saveLcaAction}>
      <input type="hidden" name="personId" value={personId} />
      {values && <input type="hidden" name="id" value={values.id} />}
      <FormField name="insurerId" label="Assureur">
        <select id="insurerId" name="insurerId" defaultValue={values?.insurerId ?? ""} className={inputClass}>
          <option value="" disabled>
            Choisir
          </option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="productName" label="Produit">
        <input
          id="productName"
          name="productName"
          defaultValue={values?.productName}
          placeholder="ex. Hospital Flex, Dentaire…"
          className={inputClass}
        />
      </FormField>
      <FormField name="category" label="Catégorie">
        <select id="category" name="category" defaultValue={values?.category ?? "HOSPITAL"} className={inputClass}>
          {LCA_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {LCA_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <FormField name="monthlyRp" label="Prime mensuelle (CHF)">
          <input
            id="monthlyRp"
            name="monthly"
            inputMode="decimal"
            defaultValue={values?.monthlyPremiumRp ? (values.monthlyPremiumRp / 100).toFixed(2) : ""}
            className={inputClass}
          />
        </FormField>
        <FormField name="policyNumber" label="N° de police">
          <input id="policyNumber" name="policyNumber" defaultValue={values?.policyNumber} className={inputClass} />
        </FormField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <FormField name="startDate" label="Début">
          <input id="startDate" name="startDate" type="date" defaultValue={values?.startDate ?? ""} className={inputClass} />
        </FormField>
        <FormField name="minTermEnd" label="Durée minimale jusqu'au">
          <input id="minTermEnd" name="minTermEnd" type="date" defaultValue={values?.minTermEnd ?? ""} className={inputClass} />
        </FormField>
      </div>
      <FormField name="noticeMonths" label="Préavis de résiliation (mois)">
        <input id="noticeMonths" name="noticeMonths" inputMode="numeric" defaultValue={values?.noticeMonths ?? 3} className={inputClass} />
      </FormField>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3 text-sm">
        <input type="checkbox" name="bundledDiscount" defaultChecked={values?.bundledDiscount} className="size-5" />
        Rabais lié à la LAMal chez le même assureur
      </label>
      {values && (
        <FormField name="status" label="Statut">
          <select id="status" name="status" defaultValue={values.status} className={inputClass}>
            <option value="ACTIVE">Active</option>
            <option value="TERMINATED">Résiliée</option>
          </select>
        </FormField>
      )}
      <SubmitButton className="w-full" variant="lca">
        Enregistrer la complémentaire
      </SubmitButton>
    </ActionForm>
  );
}
