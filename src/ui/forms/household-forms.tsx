"use client";

import { useState } from "react";
import { saveHouseholdAction, savePersonAction, savePrefsAction } from "@/app/actions";
import { MODEL_LABEL, MODEL_TYPES } from "@/domain/insurance-model";
import { CANTONS } from "@/domain/tariff";
import { ActionForm, FormField, SubmitButton } from "../action-form";
import { inputClass } from "../primitives";

export interface HouseholdFormValues {
  name: string;
  street: string;
  npa: string;
  locality: string;
  canton: string;
  region: number;
  representativePersonId: number | null;
}

export function HouseholdForm({
  values,
  persons,
  regionsByCanton,
}: {
  values: HouseholdFormValues | null;
  persons: { id: number; name: string }[];
  regionsByCanton: Record<string, number[]>;
}) {
  const [canton, setCanton] = useState(values?.canton ?? "");
  const known = regionsByCanton[canton];
  const regions = known && known.length > 0 ? known : [0, 1, 2, 3];
  return (
    <ActionForm action={saveHouseholdAction}>
      <FormField name="name" label="Nom du foyer">
        <input id="name" name="name" defaultValue={values?.name ?? "Mon foyer"} className={inputClass} autoComplete="off" />
      </FormField>
      <FormField name="street" label="Rue et numéro" hint="Utilisée comme expéditeur des lettres de résiliation.">
        <input id="street" name="street" defaultValue={values?.street} className={inputClass} autoComplete="street-address" />
      </FormField>
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <FormField name="npa" label="NPA">
          <input
            id="npa"
            name="npa"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            defaultValue={values?.npa}
            className={inputClass}
            autoComplete="postal-code"
          />
        </FormField>
        <FormField name="locality" label="Localité">
          <input id="locality" name="locality" defaultValue={values?.locality} className={inputClass} autoComplete="address-level2" />
        </FormField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <FormField name="canton" label="Canton">
          <select id="canton" name="canton" value={canton} onChange={(e) => setCanton(e.target.value)} className={inputClass} required>
            <option value="" disabled>
              Choisir
            </option>
            {CANTONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormField>
        <FormField name="region" label="Région de primes">
          <select id="region" name="region" defaultValue={values?.region ?? regions[0]} key={canton} className={inputClass}>
            {regions.map((r) => (
              <option key={r} value={r}>
                Région {r}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <p className="-mt-2 text-xs text-muted">
        La région de primes dépend de la commune (0 dans les cantons sans région). Elle figure sur ta police d&apos;assurance ou sur
        priminfo.admin.ch.
      </p>
      {persons.length > 0 && (
        <FormField name="representativePersonId" label="Signataire pour les mineurs" hint="Représentant légal qui signe les lettres des enfants.">
          <select
            id="representativePersonId"
            name="representativePersonId"
            defaultValue={values?.representativePersonId ?? ""}
            className={inputClass}
          >
            <option value="">Automatique (premier adulte)</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <SubmitButton className="w-full">Enregistrer le foyer</SubmitButton>
    </ActionForm>
  );
}

export function PersonForm({ values }: { values?: { id: number; firstName: string; lastName: string; birthDate: string } }) {
  return (
    <ActionForm action={savePersonAction}>
      {values && <input type="hidden" name="id" value={values.id} />}
      <FormField name="firstName" label="Prénom">
        <input id="firstName" name="firstName" defaultValue={values?.firstName} className={inputClass} autoComplete="given-name" required />
      </FormField>
      <FormField name="lastName" label="Nom">
        <input id="lastName" name="lastName" defaultValue={values?.lastName} className={inputClass} autoComplete="family-name" required />
      </FormField>
      <FormField name="birthDate" label="Date de naissance" hint="Détermine la classe d'âge (enfant, jeune adulte, adulte) de chaque année.">
        <input id="birthDate" name="birthDate" type="date" defaultValue={values?.birthDate} className={inputClass} required />
      </FormField>
      <SubmitButton className="w-full">{values ? "Enregistrer" : "Ajouter la personne"}</SubmitButton>
    </ActionForm>
  );
}

export function PrefsForm({
  personId,
  values,
  franchises,
  insurers,
}: {
  personId: number;
  values: {
    allowedModels: string[];
    allowedFranchises: number[];
    expectedHealthCostsRp: number;
    accidentIncluded: boolean;
    doctorName: string;
    excludedInsurers: number[];
  };
  franchises: number[];
  insurers: { id: number; name: string }[];
}) {
  return (
    <ActionForm action={savePrefsAction}>
      <input type="hidden" name="personId" value={personId} />
      <FormField
        name="expectedHealthCostsRp"
        label="Frais de santé attendus par an (CHF)"
        hint="Factures médicales estimées avant franchise ; sert à calculer le coût total et la franchise idéale."
      >
        <input
          id="expectedHealthCostsRp"
          name="expectedHealthCosts"
          inputMode="decimal"
          defaultValue={(values.expectedHealthCostsRp / 100).toFixed(0)}
          className={inputClass}
        />
      </FormField>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3">
        <input type="checkbox" name="accidentIncluded" defaultChecked={values.accidentIncluded} className="size-5 accent-[var(--primary)]" />
        <span className="text-sm">
          <span className="font-medium">Inclure la couverture accident</span>
          <span className="block text-xs text-muted">Seulement sans employeur (ou moins de 8 h par semaine chez un même employeur).</span>
        </span>
      </label>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Modèles acceptés</legend>
        <div className="flex flex-wrap gap-2">
          {MODEL_TYPES.map((m) => (
            <label key={m} className="cursor-pointer">
              <input type="checkbox" name="allowedModels" value={m} defaultChecked={values.allowedModels.includes(m)} className="peer sr-only" />
              <span className="inline-flex min-h-10 items-center rounded-full border border-border px-3 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary peer-focus-visible:outline-2">
                {MODEL_LABEL[m]}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Aucun coché = tous les modèles.</p>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Franchises envisagées</legend>
        <div className="flex flex-wrap gap-2">
          {franchises.map((f) => (
            <label key={f} className="cursor-pointer">
              <input
                type="checkbox"
                name="allowedFranchises"
                value={f}
                defaultChecked={values.allowedFranchises.includes(f)}
                className="peer sr-only"
              />
              <span className="num inline-flex min-h-10 items-center rounded-full border border-border px-3 text-sm peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary">
                {f}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Aucune cochée = toutes les franchises légales.</p>
      </fieldset>
      <FormField
        name="doctorName"
        label="Médecin traitant"
        hint="Rappel pour vérifier qu'il figure sur la liste des modèles médecin de famille / HMO."
      >
        <input id="doctorName" name="doctorName" defaultValue={values.doctorName} className={inputClass} />
      </FormField>
      {insurers.length > 0 && (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium">Caisses exclues ({values.excludedInsurers.length})</summary>
          <div className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {insurers.map((i) => (
              <label key={i.id} className="flex min-h-10 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="excludedInsurers"
                  value={i.id}
                  defaultChecked={values.excludedInsurers.includes(i.id)}
                  className="size-5"
                />
                {i.name}
              </label>
            ))}
          </div>
        </details>
      )}
      <SubmitButton className="w-full" variant="secondary">
        Enregistrer les préférences
      </SubmitButton>
    </ActionForm>
  );
}
