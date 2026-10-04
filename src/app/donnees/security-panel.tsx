"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { resetAllAction } from "@/app/actions/security";
import { Button } from "@/ui/button";
import { Field, FormError, Input } from "@/ui/form";
import { Sheet } from "@/ui/sheet";
import { SubmitButton } from "@/ui/submit";

/** Réglages › Foyer : tout effacer et recommencer (propriétaire du foyer). */
export function ResetAll() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(resetAllAction, null);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Tout effacer et recommencer ?"
      description="Personnes, contrats, rituels, lettres et signatures sont supprimés, pour tous les comptes du foyer. Les primes officielles restent."
      trigger={
        <Button variant="ghost" size="sm" className="text-increase hover:bg-increase-soft">
          <Trash2 aria-hidden className="size-4" /> Recommencer à zéro
        </Button>
      }
    >
      <form action={action} className="space-y-4">
        <Field label="Votre mot de passe, pour confirmer" htmlFor="reset-pw">
          <Input id="reset-pw" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <FormError message={state?.error} />
        <SubmitButton block variant="danger" pendingLabel="Suppression…">
          Tout effacer
        </SubmitButton>
      </form>
    </Sheet>
  );
}
