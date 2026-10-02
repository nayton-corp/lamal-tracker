"use client";

import { useActionState } from "react";
import { Field, FormError, Input } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";
import { loginAction } from "./actions";

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
