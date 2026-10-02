"use client";

import { useActionState, useEffect, useState } from "react";
import { ageClassForYear } from "@/domain/age";
import { savePersonAction } from "@/app/actions/household";
import { KID_SUBGROUPS, MODEL_LABEL, MODEL_TYPES } from "@/domain/lamal";
import { Alert } from "@/ui/alert";
import { Checkbox, Field, FormError, Input, Select } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

export interface PersonDefaults {
  id?: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  kidSubgroup: string;
  employedAccidentCover: boolean;
  healthCostsRp: number;
  allowedModels: string[];
  excludedInsurerIds: number[];
  doctorName: string | null;
}

function isMinorAround(birthDate: string, year: number): boolean {
  try {
    // Enfant cette année ou l'an prochain : l'échelon enfant compte pour le rituel.
    return ageClassForYear(birthDate, year) === "KID" || ageClassForYear(birthDate, year + 1) === "KID";
  } catch {
    return false;
  }
}

export function PersonForm({ person, insurers, year, onDone }: { person: PersonDefaults | null; insurers: { id: number; name: string }[]; year: number; onDone?: () => void }) {
  const [state, action] = useActionState(savePersonAction, null);
  const [birthDate, setBirthDate] = useState(person?.birthDate ?? "");
  const fe = state?.fieldErrors ?? {};
  const minor = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && isMinorAround(birthDate, year);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  return (
    <form action={action} className="space-y-4">
      {person?.id && <input type="hidden" name="id" value={person.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" htmlFor="firstName" error={fe.firstName}>
          <Input id="firstName" name="firstName" required defaultValue={person?.firstName} autoComplete="given-name" />
        </Field>
        <Field label="Nom" htmlFor="lastName" error={fe.lastName}>
          <Input id="lastName" name="lastName" required defaultValue={person?.lastName} autoComplete="family-name" />
        </Field>
      </div>
      <Field label="Date de naissance" htmlFor="birthDate" error={fe.birthDate} hint="Détermine la catégorie (enfant, jeune adulte, adulte) pour chaque année.">
        <Input id="birthDate" name="birthDate" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </Field>
      <Field label="Frais de santé attendus par an (CHF)" htmlFor="healthCosts" hint="Factures médicales estimées. Sert à classer les offres selon le coût total (prime + franchise + quote-part).">
        <Input id="healthCosts" name="healthCosts" inputMode="decimal" defaultValue={((person?.healthCostsRp ?? 50000) / 100).toFixed(0)} />
      </Field>
      {minor ? (
        <Field label="Échelon enfant" htmlFor="kidSubgroup" hint="K1 = tarif normal. Certaines caisses accordent un rabais dès le 2e ou 3e enfant (K3, K4, K5) : voir la police.">
          <Select id="kidSubgroup" name="kidSubgroup" defaultValue={person?.kidSubgroup ?? "K1"}>
            {KID_SUBGROUPS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="kidSubgroup" value={person?.kidSubgroup ?? "K1"} />
      )}
      {!minor && (
        <Checkbox name="employedAccidentCover" defaultChecked={person?.employedAccidentCover} label="Employé·e au moins 8 h/semaine (accidents couverts par l'employeur : la LAMal peut exclure l'accident)" />
      )}

      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium">Modèles acceptés pour le comparateur</legend>
        <p className="mb-2 text-sm text-muted">Aucun coché = tous les modèles.</p>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          {MODEL_TYPES.map((m) => (
            <Checkbox key={m} name="allowedModels" value={m} defaultChecked={person?.allowedModels.includes(m)} label={MODEL_LABEL[m]} />
          ))}
        </div>
      </fieldset>

      <Field label="Médecin traitant" htmlFor="doctorName" hint="Pour vérifier qu'il figure sur la liste des modèles médecin de famille / HMO.">
        <Input id="doctorName" name="doctorName" defaultValue={person?.doctorName ?? ""} placeholder="Dr Martin, Lausanne" />
      </Field>

      <details className="rounded-xl border border-border p-3">
        <summary className="min-h-11 cursor-pointer content-center font-medium">Caisses à exclure du comparateur</summary>
        <div className="mt-2 max-h-72 overflow-y-auto">
          {insurers.map((i) => (
            <Checkbox key={i.id} name="excludedInsurerIds" value={i.id} defaultChecked={person?.excludedInsurerIds.includes(i.id)} label={i.name} />
          ))}
        </div>
      </details>

      <FormError message={state?.error} />
      {state?.ok && <Alert tone="success" title={state.ok} />}
      <SubmitButton block>{person?.id ? "Enregistrer" : "Ajouter la personne"}</SubmitButton>
    </form>
  );
}
