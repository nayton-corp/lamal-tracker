"use client";

import { useActionState, useEffect, useState } from "react";
import { saveHouseholdAction, saveSoloAction } from "@/app/actions/household";
import { Field, FormError, Input } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";
import { CommunePicker } from "./commune-picker";

interface Household {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  commune?: string;
  bfsNumber?: number | null;
  canton: string;
  region: number;
}

export interface SoloIdentity {
  firstName: string;
  lastName: string;
  birthDate: string;
}

/**
 * Adresse du foyer : le code postal suffit pour trouver la commune, le canton et la région de
 * primes (table officielle BAG + swisstopo). Si le code postal couvre plusieurs communes, on
 * propose la plus probable et on laisse choisir. Saisie manuelle possible en dernier recours.
 * Avec `person` (mode « pour moi seul »), l'identité est saisie dans le même formulaire.
 */
export function HouseholdForm({ household, onDone, person, next, submitLabel }: {
  household: Household | null;
  onDone?: () => void;
  /** Identité de la personne seule (null = pas encore créée) ; absent en mode foyer. */
  person?: SoloIdentity | null;
  /** Page où aller après l'enregistrement (accueil guidé). */
  next?: string;
  submitLabel?: string;
}) {
  const solo = person !== undefined;
  const [state, action] = useActionState(solo ? saveSoloAction : saveHouseholdAction, null);
  const [place, setPlace] = useState<{ canton: string; region: number } | null>(null);

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  // Changement de région de primes d'un foyer existant : déménagement ou correction ?
  const moved = household !== null && place !== null && (place.canton !== household.canton || place.region !== household.region);
  const fieldErrors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {solo ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" htmlFor="firstName" error={fieldErrors.firstName}>
              <Input id="firstName" name="firstName" required defaultValue={person?.firstName} autoComplete="given-name" />
            </Field>
            <Field label="Nom" htmlFor="lastName" error={fieldErrors.lastName}>
              <Input id="lastName" name="lastName" required defaultValue={person?.lastName} autoComplete="family-name" />
            </Field>
          </div>
          <Field label="Date de naissance" htmlFor="birthDate" error={fieldErrors.birthDate}>
            <Input id="birthDate" name="birthDate" type="date" required defaultValue={person?.birthDate} />
          </Field>
        </>
      ) : (
        <input type="hidden" name="name" value={household?.name ?? ""} />
      )}
      <Field label="Rue et numéro" htmlFor="street">
        <Input id="street" name="street" defaultValue={household?.street ?? ""} autoComplete="street-address" />
      </Field>
      <CommunePicker place={household} withCity error={fieldErrors.canton || fieldErrors.region} onPlace={setPlace} />

      {moved && (
        <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-medium">Que s&apos;est-il passé ?</legend>
          {[
            { value: "MOVE", label: solo ? "J'ai déménagé" : "Nous avons déménagé", hint: "Les contrats déjà saisis gardent l'ancienne commune ; le bilan en cours prend la nouvelle." },
            { value: "CORRECTION", label: "Je corrige une erreur", hint: "Les contrats saisis avec l'ancienne commune prennent la nouvelle." },
          ].map((o) => (
            <label key={o.value} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg p-2 has-[:checked]:bg-primary-soft/50">
              <input type="radio" name="addressChange" value={o.value} defaultChecked={o.value === "MOVE"} className="mt-0.5 size-5 accent-[var(--primary)]" />
              <span>
                <span className="block font-medium">{o.label}</span>
                <span className="block text-sm text-muted">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <FormError message={state?.error} />
      <SubmitButton block>
        {submitLabel ?? "Enregistrer le foyer"}
      </SubmitButton>
    </form>
  );
}
