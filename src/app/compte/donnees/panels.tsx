"use client";

import { startAuthentication, WebAuthnError } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { confirmPasskeyAction, confirmPasskeyOptionsAction, confirmPasswordAction, deleteAccountAction, deleteHouseholdAction } from "@/app/actions/data-rights";
import { Button } from "@/ui/button";
import { Field, FormError, Input } from "@/ui/form";
import { usePasskeySupport } from "@/ui/media";
import { Sheet } from "@/ui/sheet";
import { SubmitButton } from "@/ui/submit";

/** Confirmation de l'identité : mot de passe, ou passkey si le compte en a une. */
export function ConfirmIdentity({ hasPasskey }: { hasPasskey: boolean }) {
  const [state, action] = useActionState(confirmPasswordAction, null);
  return (
    <div className="space-y-4">
      {hasPasskey && <ConfirmWithPasskey />}
      <form action={action} className="space-y-3">
        <input type="hidden" name="username" autoComplete="username" value="" />
        <Field label="Votre mot de passe" htmlFor="confirm-pw">
          <Input id="confirm-pw" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <FormError message={state?.error} />
        <SubmitButton block pendingLabel="Vérification…">
          Confirmer
        </SubmitButton>
      </form>
    </div>
  );
}

function ConfirmWithPasskey() {
  const supported = usePasskeySupport();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!supported) return null;

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const { options, error } = await confirmPasskeyOptionsAction();
      if (!options) throw new Error(error ?? "Confirmation par passkey indisponible.");
      const result = await confirmPasskeyAction(await startAuthentication({ optionsJSON: options }));
      if (result.error) setError(result.error);
      else router.refresh();
    } catch (e) {
      // Fenêtre fermée par l'utilisateur : pas d'erreur à afficher.
      const aborted = (e instanceof WebAuthnError && e.code === "ERROR_CEREMONY_ABORTED") || (e instanceof Error && e.name === "NotAllowedError");
      if (!aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" block onClick={confirm} disabled={pending}>
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Fingerprint aria-hidden className="size-5" />}
        Confirmer avec une passkey
      </Button>
      <FormError message={error} />
      <p className="text-center text-sm text-muted">ou</p>
    </div>
  );
}

/** Action irréversible : une feuille explique, puis on confirme. */
function DangerSheet({ label, title, description, children, action }: { label: string; title: string; description: string; children: React.ReactNode; action: (state: { error?: string } | null) => Promise<{ error?: string } | null> }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, null);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      trigger={
        <Button variant="ghost" size="sm" className="text-increase hover:bg-increase-soft">
          <Trash2 aria-hidden className="size-4" /> {label}
        </Button>
      }
    >
      <form action={formAction} className="space-y-4">
        <div className="space-y-2 text-sm text-muted">{children}</div>
        <FormError message={state?.error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <SubmitButton variant="danger" pendingLabel="Suppression…">
            {label}
          </SubmitButton>
        </div>
      </form>
    </Sheet>
  );
}

export function DeleteHousehold({ members }: { members: number }) {
  return (
    <DangerSheet label="Supprimer le foyer" title="Supprimer le foyer ?" description="Tout ce que le foyer a saisi disparaît aussitôt." action={deleteHouseholdAction}>
      <p>Personnes, contrats, bilans, lettres, signatures et réglages sont effacés, ainsi que la clé qui chiffrait les signatures. Les primes officielles restent.</p>
      {members > 1 && <p>Les {members - 1} autre(s) compte(s) du foyer restent ouverts, mais sans foyer.</p>}
      <p>Votre compte reste ouvert : vous pourrez créer un nouveau foyer.</p>
    </DangerSheet>
  );
}

export function DeleteAccount({ household, others, owner }: { household: boolean; others: number; owner: boolean }) {
  return (
    <DangerSheet label="Supprimer mon compte" title="Supprimer votre compte ?" description="La suppression est immédiate et définitive." action={deleteAccountAction}>
      <p>Votre courriel, votre mot de passe, vos passkeys, votre double facteur, vos appareils et votre journal sont effacés.</p>
      {!household ? null : others === 0 ? (
        <p>Vous êtes seul dans votre foyer : il est supprimé aussi, avec tout ce qu&apos;il contient.</p>
      ) : (
        <p>
          Le foyer reste aux {others} autre(s) compte(s){owner ? " ; le plus ancien en devient propriétaire" : ""}.
        </p>
      )}
      <p>Pensez à télécharger vos données avant.</p>
    </DangerSheet>
  );
}
