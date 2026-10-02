"use client";

import { useActionState } from "react";
import { saveHouseholdAction } from "@/app/actions/household";
import { CANTONS } from "@/domain/lamal";
import { Alert } from "@/ui/alert";
import { Field, FormError, Input, Select } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

interface Household {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  canton: string;
  region: number;
}

export function HouseholdForm({ household }: { household: Household | null }) {
  const [state, action] = useActionState(saveHouseholdAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <Field label="Nom du foyer" htmlFor="name" error={fe.name}>
        <Input id="name" name="name" required defaultValue={household?.name ?? ""} placeholder="Famille Dupont" autoComplete="family-name" />
      </Field>
      <Field label="Rue et numéro" htmlFor="street" hint="Utilisée comme expéditeur des lettres.">
        <Input id="street" name="street" defaultValue={household?.street ?? ""} autoComplete="street-address" />
      </Field>
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Field label="NPA" htmlFor="postalCode">
          <Input id="postalCode" name="postalCode" inputMode="numeric" defaultValue={household?.postalCode ?? ""} autoComplete="postal-code" />
        </Field>
        <Field label="Localité" htmlFor="city">
          <Input id="city" name="city" defaultValue={household?.city ?? ""} autoComplete="address-level2" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Canton" htmlFor="canton" error={fe.canton}>
          <Select id="canton" name="canton" defaultValue={household?.canton ?? "VD"}>
            {CANTONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Région de primes" htmlFor="region" error={fe.region}>
          <Select id="region" name="region" defaultValue={String(household?.region ?? 1)}>
            <option value="0">Région 0 (canton sans régions)</option>
            <option value="1">Région 1</option>
            <option value="2">Région 2</option>
            <option value="3">Région 3</option>
          </Select>
        </Field>
      </div>
      <p className="text-sm text-muted">
        La région dépend de votre commune : elle figure sur votre police d&apos;assurance ou sur priminfo.admin.ch. Les cantons de GE, BS, AI, AR, GL, NW, OW, UR, ZG, JU et NE n&apos;ont qu&apos;une région (0) ou deux.
      </p>
      <FormError message={state?.error} />
      {state?.ok && <Alert tone="success" title={state.ok} />}
      <SubmitButton block>Enregistrer le foyer</SubmitButton>
    </form>
  );
}
