"use client";

import { useActionState } from "react";
import { saveInsurerAction } from "@/app/actions/data";
import { Field, FormError, Input, Textarea } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

export function InsurerForm({ insurer }: { insurer: { id: number; name: string; displayName: string | null; terminationAddress: string | null; website: string | null } }) {
  const [state, action] = useActionState(saveInsurerAction, null);
  return (
    <form action={action} className="space-y-3 pt-3">
      <input type="hidden" name="id" value={insurer.id} />
      <Field label="Nom affiché" htmlFor={`dn-${insurer.id}`} hint={`Raison sociale : ${insurer.name}`}>
        <Input id={`dn-${insurer.id}`} name="displayName" defaultValue={insurer.displayName ?? ""} placeholder={insurer.name} />
      </Field>
      <Field label="Adresse de résiliation" htmlFor={`ad-${insurer.id}`} hint="Telle qu'elle figure sur votre police ou le site de la caisse, une ligne par ligne d'adresse (sans le nom de la caisse).">
        <Textarea id={`ad-${insurer.id}`} name="terminationAddress" defaultValue={insurer.terminationAddress ?? ""} placeholder={"Case postale\n1000 Lausanne"} rows={3} />
      </Field>
      <Field label="Site web" htmlFor={`web-${insurer.id}`}>
        <Input id={`web-${insurer.id}`} name="website" type="url" defaultValue={insurer.website ?? ""} placeholder="https://" />
      </Field>
      <FormError message={state?.error} />
      {state?.ok && <p className="text-sm text-saving">{state.ok}</p>}
      <SubmitButton size="sm">Enregistrer</SubmitButton>
    </form>
  );
}
