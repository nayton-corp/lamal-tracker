"use client";

import { useActionState } from "react";
import { Field, FormError, Input } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";
import { createPasswordAction, loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="username" autoComplete="username" value="lamal" />
      <Field label="Mot de passe" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Vérification…">Entrer</SubmitButton>
    </form>
  );
}

export function CreatePasswordForm() {
  const [state, action] = useActionState(createPasswordAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="username" autoComplete="username" value="lamal" />
      <Field label="Mot de passe" htmlFor="password" hint="Au moins 8 caractères. Il protège vos données de santé sur cet appareil et les autres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
      </Field>
      <Field label="Confirmer" htmlFor="confirm" error={fe.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Enregistrement…">Créer le mot de passe</SubmitButton>
    </form>
  );
}
