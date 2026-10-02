"use client";

import { useActionState, useEffect, useState } from "react";
import { resetInsurerAddressAction, saveInsurerAction } from "@/app/actions/data";
import { Button } from "@/ui/button";
import { Field, FormError, Input, Textarea } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

interface InsurerFormProps {
  insurer: { id: number; name: string; displayName: string | null; terminationAddress: string | null; officialAddress: string | null; website: string | null };
}

/** Correction ponctuelle : nom affiché, adresse de résiliation propre, site. Fermé par défaut. */
export function InsurerForm({ insurer }: InsurerFormProps) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(saveInsurerAction, null);
  const [resetState, reset] = useActionState(resetInsurerAddressAction, null);
  const custom = Boolean(insurer.terminationAddress?.trim());
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);
  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Modifier
        </Button>
        {custom && insurer.officialAddress && (
          <form action={reset}>
            <input type="hidden" name="id" value={insurer.id} />
            <SubmitButton size="sm" variant="ghost" pendingLabel="…">
              Revenir à l&apos;adresse officielle
            </SubmitButton>
          </form>
        )}
        {(state?.ok || resetState?.ok) && <p className="w-full text-sm text-saving">{state?.ok ?? resetState?.ok}</p>}
        <FormError message={resetState?.error} />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={insurer.id} />
      <Field label="Nom affiché" htmlFor={`dn-${insurer.id}`} hint={`Raison sociale : ${insurer.name}`}>
        <Input id={`dn-${insurer.id}`} name="displayName" defaultValue={insurer.displayName ?? ""} placeholder={insurer.name} />
      </Field>
      <Field
        label="Adresse de résiliation"
        htmlFor={`ad-${insurer.id}`}
        hint="Laissez vide pour utiliser l'adresse officielle. Une ligne par ligne d'adresse, sans le nom de la caisse."
      >
        <Textarea id={`ad-${insurer.id}`} name="terminationAddress" defaultValue={insurer.terminationAddress ?? ""} placeholder={insurer.officialAddress ?? "Case postale\n1000 Lausanne"} rows={3} />
      </Field>
      <Field label="Site web" htmlFor={`web-${insurer.id}`}>
        <Input id={`web-${insurer.id}`} name="website" type="url" defaultValue={insurer.website ?? ""} placeholder="https://" />
      </Field>
      <FormError message={state?.error} />
      <div className="flex gap-2">
        <SubmitButton size="sm">Enregistrer</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
