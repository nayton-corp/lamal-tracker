"use client";

import { startAuthentication, WebAuthnError } from "@simplewebauthn/browser";
import { Fingerprint, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { FormError } from "@/ui/form";
import { usePasskeySupport } from "@/ui/media";
import { passkeyLoginAction, passkeyLoginOptionsAction } from "./actions";

/** « Se connecter avec une passkey » : affiché seulement si l'appareil et la page le permettent. */
export function PasskeyLoginButton({ next }: { next: string }) {
  const supported = usePasskeySupport();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!supported) return null;

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const { options, error } = await passkeyLoginOptionsAction();
      if (!options) throw new Error(error ?? "Connexion par passkey indisponible.");
      const response = await startAuthentication({ optionsJSON: options });
      const result = await passkeyLoginAction(response, next);
      if (result?.error) setError(result.error);
    } catch (e) {
      // Fenêtre fermée par l'utilisateur : pas d'erreur à afficher.
      if (e instanceof WebAuthnError && e.code === "ERROR_CEREMONY_ABORTED") setError(null);
      else if (e instanceof Error && e.name === "NotAllowedError") setError(null);
      else if (e instanceof Error && !/NEXT_REDIRECT/.test(e.message)) setError(e.message);
      else throw e;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" block onClick={signIn} disabled={pending}>
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Fingerprint aria-hidden className="size-5" />}
        Se connecter avec une passkey
      </Button>
      <FormError message={error} />
    </div>
  );
}
