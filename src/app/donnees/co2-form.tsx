"use client";

import { useActionState } from "react";
import { saveCo2Action } from "@/app/actions/data";
import { Input } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

export function Co2Form({ year, amountRp }: { year: number; amountRp: number | null }) {
  const [state, action] = useActionState(saveCo2Action, null);
  return (
    <form action={action} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2">
      <input type="hidden" name="year" value={year} />
      <span className="font-semibold tabular">{year}</span>
      <label>
        <Input name="co2Annual" inputMode="decimal" aria-label={`Redistribution CO2 ${year} en CHF par personne et par an`} defaultValue={amountRp === null ? "" : (amountRp / 100).toFixed(2)} placeholder="à saisir" />
      </label>
      <SubmitButton size="sm" variant="secondary" pendingLabel="…">
        OK
      </SubmitButton>
      {state?.error && <span className="text-sm text-increase">{state.error}</span>}
    </form>
  );
}
