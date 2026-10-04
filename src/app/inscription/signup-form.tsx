"use client";

import Link from "next/link";
import { useActionState } from "react";
import { NewPasswordFields } from "@/app/login/login-form";
import { Checkbox, Field, FormError, Input } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";
import { confirmEmailAction, signUpAction } from "./actions";

export function SignUpForm({ code }: { code: string }) {
  const [state, action] = useActionState(signUpAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <Field label="Code d'invitation" htmlFor="code">
        <Input id="code" name="code" defaultValue={code} required autoComplete="off" spellCheck={false} />
      </Field>
      <Field label="Votre courriel" htmlFor="email" hint="Il sert à vous connecter. Nous n'y envoyons que des messages liés à votre compte.">
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus={Boolean(code)} />
      </Field>
      <NewPasswordFields errors={fe} />
      <Checkbox
        name="consent"
        required
        label={
          <span className="text-sm">
            J&apos;accepte que l&apos;app enregistre les données de santé que je saisis (caisse, franchise, modèle d&apos;assurance), uniquement pour m&apos;aider à gérer mes primes. Détails dans la{" "}
            <Link href="/confidentialite" className="text-primary underline" target="_blank">déclaration de confidentialité</Link>. J&apos;accepte les{" "}
            <Link href="/conditions" className="text-primary underline" target="_blank">conditions d&apos;utilisation</Link>.
          </span>
        }
      />
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Création…">Créer mon compte</SubmitButton>
    </form>
  );
}

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(confirmEmailAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Confirmation…">Confirmer mon adresse</SubmitButton>
    </form>
  );
}
