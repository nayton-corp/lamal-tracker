"use client";

import { useActionState, useState } from "react";
import { resetCo2Action, saveCo2Action } from "@/app/actions/data";
import { Button } from "@/ui/button";
import { Input } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

const chf = (rp: number) => (rp / 100).toFixed(2);

/**
 * Montant d'une année : officiel par défaut (repris de l'OFEV), modifiable au besoin. Une saisie
 * n'est plus écrasée par les mises à jour, jusqu'au retour au montant officiel.
 */
export function Co2Form({ year, amountRp, source, officialRp }: { year: number; amountRp: number | null; source: "OFFICIAL" | "USER"; officialRp: number | null }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof saveCo2Action>>, form: FormData) => {
    const res = await saveCo2Action(prev, form);
    if (res?.ok) setEditing(false);
    return res;
  }, null);
  const [, reset] = useActionState(resetCo2Action, null);

  if (editing) {
    return (
      <form action={action} className="grid grid-cols-[3.5rem_1fr_auto_auto] items-center gap-2">
        <input type="hidden" name="year" value={year} />
        <span className="font-semibold tabular">{year}</span>
        <Input name="co2Annual" inputMode="decimal" autoFocus aria-label={`Redistribution CO2 ${year} en CHF par personne et par an`} defaultValue={amountRp === null ? "" : chf(amountRp)} />
        <SubmitButton size="sm" pendingLabel="…">
          OK
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Annuler
        </Button>
        {state?.error && <span className="col-span-4 text-sm text-increase">{state.error}</span>}
      </form>
    );
  }
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="w-14 font-semibold tabular">{year}</span>
      <span className="flex-1">
        {amountRp === null ? (
          <span className="text-muted">pas encore publié</span>
        ) : (
          <>
            <span className="font-medium tabular">CHF {chf(amountRp)}</span>{" "}
            <span className="text-sm text-muted">{source === "USER" ? "· votre montant" : "· officiel"}</span>
          </>
        )}
      </span>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Modifier
      </Button>
      {source === "USER" && officialRp !== null && officialRp !== amountRp && (
        <form action={reset} className="w-full pl-17">
          <input type="hidden" name="year" value={year} />
          <SubmitButton size="sm" variant="ghost" pendingLabel="…">
            Revenir au montant officiel (CHF {chf(officialRp)})
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
