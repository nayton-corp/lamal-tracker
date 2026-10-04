"use client";

import { useActionState } from "react";
import { Field, FormError, Input } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";
import { createPasswordAction, forgotPasswordAction, loginAction, mfaAction, resetPasswordAction } from "./actions";

/**
 * Connexion par courriel et mot de passe. `legacy` : instance mise à jour dont l'administrateur
 * n'a pas encore de courriel ; il laisse le champ vide.
 */
export function LoginForm({ next, legacy }: { next: string; legacy: boolean }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Courriel" htmlFor="email" hint={legacy ? "Administrateur sans courriel enregistré : laissez ce champ vide." : undefined}>
        <Input id="email" name="email" type="email" autoComplete="username webauthn" inputMode="email" required={!legacy} autoFocus />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Vérification…">Se connecter</SubmitButton>
    </form>
  );
}

export function MfaForm({ next }: { next: string }) {
  const [state, action] = useActionState(mfaAction, null);
  if (state?.ok === "restart") {
    return (
      <div className="space-y-4">
        <FormError message={state.error} />
        <a href="/login" className="block text-center font-medium text-primary underline">Revenir à la connexion</a>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Code à 6 chiffres" htmlFor="code" hint="Affiché par votre application d'authentification. Vous pouvez aussi saisir un code de secours.">
        <Input id="code" name="code" autoComplete="one-time-code" inputMode="text" required autoFocus maxLength={20} />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Vérification…">Valider</SubmitButton>
    </form>
  );
}

export function CreatePasswordForm({ askEmail, askSetupCode }: { askEmail: boolean; askSetupCode: boolean }) {
  const [state, action] = useActionState(createPasswordAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {askEmail ? (
        <Field label="Votre courriel" htmlFor="email" hint="Il sert à vous connecter et à réinitialiser le mot de passe.">
          <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
        </Field>
      ) : (
        <input type="hidden" name="username" autoComplete="username" value="administrateur" />
      )}
      <NewPasswordFields errors={fe} autoFocus={!askEmail} />
      {askSetupCode && (
        <Field label="Code d'installation" htmlFor="setup" error={fe.setup} hint="La valeur de SETUP_TOKEN dans la configuration du serveur.">
          <Input id="setup" name="setup" type="password" autoComplete="off" required />
        </Field>
      )}
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Enregistrement…">{askEmail ? "Créer le compte" : "Enregistrer le mot de passe"}</SubmitButton>
    </form>
  );
}

/** Nouveau mot de passe et sa confirmation. */
export function NewPasswordFields({ errors, autoFocus, label = "Mot de passe" }: { errors: Record<string, string>; autoFocus?: boolean; label?: string }) {
  return (
    <>
      <Field label={label} htmlFor="password" error={errors.password} hint="Au moins 12 caractères. Une phrase de quelques mots est facile à retenir et solide.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} autoFocus={autoFocus} />
      </Field>
      <Field label="Confirmer" htmlFor="confirm" error={errors.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
    </>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  if (state?.ok) return <p role="status" className="rounded-xl bg-saving-soft p-3 text-sm text-saving">{state.ok}</p>;
  return (
    <form action={action} className="space-y-4">
      <Field label="Votre courriel" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
      </Field>
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Envoi…">Recevoir un lien</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token, needsCode }: { token: string; needsCode: boolean }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="username" autoComplete="username" value="" />
      <NewPasswordFields errors={fe} autoFocus label="Nouveau mot de passe" />
      {needsCode && (
        <Field label="Code du double facteur" htmlFor="code" hint="Code de votre application d'authentification, ou un code de secours.">
          <Input id="code" name="code" autoComplete="one-time-code" required maxLength={20} />
        </Field>
      )}
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Enregistrement…">Enregistrer le mot de passe</SubmitButton>
    </form>
  );
}
