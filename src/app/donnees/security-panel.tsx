"use client";

import { KeyRound, LogOut, Smartphone, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { changePasswordAction, logoutOthersAction, resetAllAction } from "@/app/actions/security";
import type { SessionInfo } from "@/application/auth";
import { ActionForm } from "@/ui/action-form";
import { Button } from "@/ui/button";
import { Field, FormError, Input } from "@/ui/form";
import { Sheet } from "@/ui/sheet";
import { SubmitButton } from "@/ui/submit";

/** Réglages › Sécurité : mot de passe, appareils connectés, déconnexion, remise à zéro. */
export function SecurityPanel({ sessions, currentId }: { sessions: SessionInfo[]; currentId: string }) {
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-xl border border-border text-sm">
        {sessions.map((s) => (
          <li key={s.id} className="flex min-h-11 items-center gap-2 px-3 py-2">
            <Smartphone aria-hidden className="size-4 shrink-0 text-muted" />
            <span className="flex-1">
              {s.device}
              {s.id === currentId && <span className="ml-1 text-muted">(cet appareil)</span>}
            </span>
            <span className="text-muted">{new Date(s.lastSeenAt).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" })}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <ChangePassword />
        {sessions.length > 1 && (
          <ActionForm action={logoutOthersAction}>
            <SubmitButton variant="secondary" size="sm" pendingLabel="…">
              Déconnecter les autres appareils
            </SubmitButton>
          </ActionForm>
        )}
        <form action={logoutAction}>
          <SubmitButton variant="secondary" size="sm" pendingLabel="…">
            <LogOut aria-hidden className="size-4" /> Se déconnecter
          </SubmitButton>
        </form>
      </div>
      <ResetAll />
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(changePasswordAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Changer le mot de passe"
      trigger={
        <Button variant="secondary" size="sm">
          <KeyRound aria-hidden className="size-4" /> Changer le mot de passe
        </Button>
      }
    >
      {state?.ok ? (
        <div className="space-y-4">
          <p>{state.ok}</p>
          <Button block onClick={() => setOpen(false)}>Fermer</Button>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="username" autoComplete="username" value="lamal" />
          <Field label="Mot de passe actuel" htmlFor="pw-current">
            <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="Nouveau mot de passe" htmlFor="pw-next" hint="Au moins 8 caractères.">
            <Input id="pw-next" name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label="Confirmer" htmlFor="pw-confirm" error={fe.confirm}>
            <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <FormError message={state?.error} />
          <SubmitButton block pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
        </form>
      )}
    </Sheet>
  );
}

function ResetAll() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(resetAllAction, null);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Tout effacer et recommencer ?"
      description="Personnes, contrats, rituels, lettres et signatures sont supprimés. Les primes officielles restent."
      trigger={
        <Button variant="ghost" size="sm" className="text-increase hover:bg-increase-soft">
          <Trash2 aria-hidden className="size-4" /> Recommencer à zéro
        </Button>
      }
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="username" autoComplete="username" value="lamal" />
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
