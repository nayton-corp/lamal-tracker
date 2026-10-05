"use client";

import { useActionState, useEffect, useState } from "react";
import { ageClassForYear } from "@/domain/age";
import { savePersonAction } from "@/app/actions/household";
import { DEFAULT_KID_SUBGROUP, KID_SUBGROUPS } from "@/domain/lamal";
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
}

const KID_RANK: Record<string, string> = { K1: "Tarif normal", K3: "Rabais 3e enfant", K4: "Rabais 4e enfant", K5: "Rabais dès le 5e enfant" };

function isMinorAround(birthDate: string, year: number): boolean {
  try {
    // Enfant cette année ou l'an prochain : l'échelon enfant compte pour le rituel.
    return ageClassForYear(birthDate, year) === "KID" || ageClassForYear(birthDate, year + 1) === "KID";
  } catch {
    return false;
  }
}

/**
 * Identité d'une personne. Les préférences du comparateur (frais, modèles, médecin) se règlent
 * au questionnaire des besoins du rituel, pas ici. `stay` : rester sur la page après un ajout.
 */
export function PersonForm({ person, year, onDone, stay, next, submitLabel }: {
  person: PersonDefaults | null;
  year: number;
  onDone?: () => void;
  stay?: boolean;
  /** Page où aller après l'enregistrement (accueil guidé). */
  next?: string;
  submitLabel?: string;
}) {
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
      {stay && <input type="hidden" name="stay" value="1" />}
      {next && <input type="hidden" name="next" value={next} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" htmlFor="firstName" error={fe.firstName}>
          <Input id="firstName" name="firstName" required defaultValue={person?.firstName} autoComplete="given-name" />
        </Field>
        <Field label="Nom" htmlFor="lastName" error={fe.lastName}>
          <Input id="lastName" name="lastName" required defaultValue={person?.lastName} autoComplete="family-name" />
        </Field>
      </div>
      <Field label="Date de naissance" htmlFor="birthDate" error={fe.birthDate}>
        <Input id="birthDate" name="birthDate" type="date" required value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </Field>
      {minor ? (
        <Field label="Rang de l'enfant" htmlFor="kidSubgroup" hint="Certaines caisses font un rabais dès le 2e ou 3e enfant : voir la police.">
          <Select id="kidSubgroup" name="kidSubgroup" defaultValue={person?.kidSubgroup ?? DEFAULT_KID_SUBGROUP}>
            {KID_SUBGROUPS.map((k) => (
              <option key={k} value={k}>
                {KID_RANK[k]}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="kidSubgroup" value={person?.kidSubgroup ?? DEFAULT_KID_SUBGROUP} />
      )}
      {!minor && person?.id && (
        <Checkbox name="employedAccidentCover" defaultChecked={person?.employedAccidentCover} label="Employé·e au moins 8 h par semaine (accident couvert par l'employeur)" />
      )}

      <FormError message={state?.error} />
      {state?.ok && <Alert tone="success" title={state.ok} />}
      <SubmitButton block>{submitLabel ?? (person?.id ? "Enregistrer" : "Ajouter la personne")}</SubmitButton>
    </form>
  );
}
