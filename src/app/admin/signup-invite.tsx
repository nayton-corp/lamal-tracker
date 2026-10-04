"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { createSignupInviteAction } from "@/app/actions/admin";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Field, FormError, Input } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

/** Nouvelle invitation à s'inscrire : le lien n'est affiché qu'une fois. */
export function SignupInviteForm() {
  const [state, action] = useActionState(createSignupInviteAction, null);
  const [copied, setCopied] = useState(false);
  const fe = state?.fieldErrors ?? {};
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <Field label="Pour qui (note pour vous)" htmlFor="invite-label" hint="Facultatif, par exemple « Famille Dupont ».">
          <Input id="invite-label" name="label" maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Utilisations" htmlFor="invite-uses" error={fe.maxUses}>
            <Input id="invite-uses" name="maxUses" type="number" min={1} max={100} defaultValue={1} required />
          </Field>
          <Field label="Valable (jours)" htmlFor="invite-days" error={fe.days}>
            <Input id="invite-days" name="days" type="number" min={1} max={60} defaultValue={14} required />
          </Field>
        </div>
        <FormError message={state?.error} />
        <SubmitButton pendingLabel="Création…">Créer l&apos;invitation</SubmitButton>
      </form>
      {state?.link && (
        <div className="space-y-3">
          <Alert tone="success" title="Invitation créée">Copiez le lien maintenant : il ne sera plus affiché.</Alert>
          <Input readOnly value={state.link} aria-label="Lien d'inscription" onFocus={(e) => e.currentTarget.select()} />
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(state.link!);
              setCopied(true);
            }}
          >
            {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} {copied ? "Copié" : "Copier le lien"}
          </Button>
        </div>
      )}
    </div>
  );
}
