"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Loader2, LogOut, Mail, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, type ReactNode } from "react";
import {
  changeEmailAction,
  changePasswordAction,
  disableTotpAction,
  logoutOthersAction,
  passkeyRegisterAction,
  passkeyRegistrationOptionsAction,
  regenerateCodesAction,
  removePasskeyAction,
  totpSetupAction,
  type TotpSetupState,
} from "@/app/actions/account";
import { logoutAction } from "@/app/login/actions";
import { NewPasswordFields } from "@/app/login/login-form";
import type { SessionInfo } from "@/application/auth";
import { ActionForm } from "@/ui/action-form";
import { Alert } from "@/ui/alert";
import { Button, type ButtonProps } from "@/ui/button";
import { Field, FormError, Input } from "@/ui/form";
import { usePasskeySupport } from "@/ui/media";
import { Sheet } from "@/ui/sheet";
import { SubmitButton } from "@/ui/submit";
import { formatTimestamp } from "@/domain/dates";


/** Champ « mot de passe actuel » des actions sensibles. */
function CurrentPassword({ id }: { id: string }) {
  return (
    <Field label="Votre mot de passe, pour confirmer" htmlFor={id}>
      <Input id={id} name="password" type="password" autoComplete="current-password" required />
    </Field>
  );
}

/** Panneau d'action : un bouton qui ouvre un formulaire dans une feuille. */
function SheetAction({ label, title, description, icon, variant = "secondary", children }: { label: string; title: string; description?: string; icon?: ReactNode; variant?: ButtonProps["variant"]; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      trigger={
        <Button variant={variant} size="sm">
          {icon}
          {label}
        </Button>
      }
    >
      {open && children(() => setOpen(false))}
    </Sheet>
  );
}

// ───────────────────────── Courriel et mot de passe ─────────────────────────

export function EmailPanel({ email, verified }: { email: string | null; verified: boolean }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2">
        <Mail aria-hidden className="size-4 text-muted" />
        {email ? <span className="font-medium break-all">{email}</span> : <span className="text-muted">Aucun courriel enregistré</span>}
        {email && !verified && <span className="text-sm text-muted">(non confirmé)</span>}
      </p>
      <SheetAction label={email ? "Changer d'adresse" : "Ajouter une adresse"} title="Adresse de courriel" description="Elle sert à vous connecter et à réinitialiser le mot de passe.">
        {() => (
          <ActionForm action={changeEmailAction} className="space-y-4">
            <Field label="Nouvelle adresse" htmlFor="new-email">
              <Input id="new-email" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
            </Field>
            <CurrentPassword id="email-pw" />
            <SubmitButton block>Enregistrer</SubmitButton>
          </ActionForm>
        )}
      </SheetAction>
    </div>
  );
}

export function PasswordPanel() {
  const [state, action] = useActionState(changePasswordAction, null);
  return (
    <SheetAction label="Changer le mot de passe" title="Changer le mot de passe" description="Les autres appareils seront déconnectés." icon={<KeyRound aria-hidden className="size-4" />}>
      {(close) =>
        state?.ok ? (
          <div className="space-y-4">
            <Alert tone="success">{state.ok}</Alert>
            <Button block onClick={close}>Fermer</Button>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="username" autoComplete="username" value="" />
            <Field label="Mot de passe actuel" htmlFor="pw-current">
              <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
            </Field>
            <NewPasswordFields errors={state?.fieldErrors ?? {}} label="Nouveau mot de passe" />
            <FormError message={state?.error} />
            <SubmitButton block>Enregistrer</SubmitButton>
          </form>
        )
      }
    </SheetAction>
  );
}

// ───────────────────────── Passkeys ─────────────────────────

/** Ajout d'une passkey : mot de passe redemandé si la connexion date de plus de dix minutes. */
export function AddPasskey({ onDone, label = "Ajouter une passkey", block }: { onDone?: () => void; label?: string; block?: boolean }) {
  const supported = usePasskeySupport();
  const [pending, setPending] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (supported === null) return null;
  if (!supported) {
    return <p className="text-sm text-muted">Cet appareil ou cette adresse (il faut HTTPS) ne permet pas les passkeys.</p>;
  }
  if (done) return <Alert tone="success">Passkey ajoutée : la prochaine fois, connectez-vous avec elle.</Alert>;

  async function add() {
    setPending(true);
    setError(null);
    try {
      const res = await passkeyRegistrationOptionsAction(needPassword ? password : null);
      if (res.needPassword) {
        setNeedPassword(true);
        setError(res.error ?? null);
        return;
      }
      if (!res.options) throw new Error(res.error ?? "Impossible de créer la passkey.");
      const response = await startRegistration({ optionsJSON: res.options });
      const result = await passkeyRegisterAction(response);
      if (result.error) throw new Error(result.error);
      setDone(true);
      onDone?.();
    } catch (e) {
      if (e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError")) setError("Création annulée.");
      else if (e instanceof Error && e.name === "InvalidStateError") setError("Cet appareil a déjà une passkey pour votre compte.");
      else setError(e instanceof Error ? e.message : "Impossible de créer la passkey.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {needPassword && (
        <Field label="Votre mot de passe, pour confirmer" htmlFor="passkey-pw">
          <Input id="passkey-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
      )}
      <Button type="button" variant={block ? "primary" : "secondary"} size={block ? "lg" : "sm"} block={block} onClick={add} disabled={pending || (needPassword && !password)}>
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Fingerprint aria-hidden className="size-5" />}
        {label}
      </Button>
      <FormError message={error} />
    </div>
  );
}

export function PasskeysPanel({ passkeys }: { passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Face ID, Touch ID ou l&apos;empreinte de votre téléphone : plus sûr qu&apos;un mot de passe, et plus rapide.</p>
      {passkeys.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {passkeys.map((k) => (
            <li key={k.id} className="flex min-h-11 items-center gap-2 px-3 py-2">
              <Fingerprint aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="flex-1">
                {k.name || "Passkey"}
                <span className="block text-muted">Ajoutée le {formatTimestamp(k.createdAt, "date")}{k.lastUsedAt ? ` · utilisée le ${formatTimestamp(k.lastUsedAt, "date")}` : ""}</span>
              </span>
              <SheetAction label="Retirer" title="Retirer cette passkey ?" description="Elle ne permettra plus de se connecter." variant="ghost" icon={<Trash2 aria-hidden className="size-4" />}>
                {() => (
                  <ActionForm action={removePasskeyAction} hidden={{ id: k.id }} className="space-y-4">
                    <CurrentPassword id={`rm-${k.id.slice(0, 8)}`} />
                    <SubmitButton block variant="danger">Retirer</SubmitButton>
                  </ActionForm>
                )}
              </SheetAction>
            </li>
          ))}
        </ul>
      )}
      <AddPasskey />
    </div>
  );
}

// ───────────────────────── Double facteur ─────────────────────────

function RecoveryCodes({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const router = useRouter();
  const done = () => {
    onClose();
    router.refresh();
  };
  return (
    <div className="space-y-4">
      <Alert tone="success" title="Notez vos codes de secours">
        Chacun permet une connexion si vous n&apos;avez plus votre téléphone. Gardez-les en lieu sûr : ils ne seront plus affichés.
      </Alert>
      <ol className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 font-mono text-base tabular" aria-label="Codes de secours">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <Button variant="secondary" block onClick={() => void navigator.clipboard?.writeText(codes.join("\n"))}>Copier les codes</Button>
      <Button block onClick={done}>J&apos;ai noté mes codes</Button>
    </div>
  );
}

/** Les codes de secours s'affichent dans une feuille à part : l'activation rafraîchit la page. */
type ShowCodes = (codes: string[]) => void;

function TotpSetup({ close, onCodes }: { close: () => void; onCodes: ShowCodes }) {
  const [state, action] = useActionState(async (prev: TotpSetupState, form: FormData) => {
    const next = await totpSetupAction(prev, form);
    if (next?.codes) {
      close();
      onCodes(next.codes);
    }
    return next;
  }, null);
  if (state?.secret && !state.codes) {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="step" value="confirm" />
        <input type="hidden" name="secret" value={state.secret} />
        <input type="hidden" name="qr" value={state.qr ?? ""} />
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>Ouvrez votre application d&apos;authentification (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
          <li>Scannez ce code, ou saisissez la clé à la main.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element -- QR code généré côté serveur (data URL) */}
        {state.qr && <img src={state.qr} alt="QR code à scanner avec l'application d'authentification" width={220} height={220} className="mx-auto rounded-xl bg-white p-2" />}
        <p className="text-center text-sm">
          Clé : <code className="font-mono break-all select-all" data-testid="totp-secret">{state.secret}</code>
        </p>
        <Field label="Code affiché par l'application" htmlFor="totp-code">
          <Input id="totp-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus />
        </Field>
        <FormError message={state.error} />
        <SubmitButton block pendingLabel="Vérification…">Activer</SubmitButton>
      </form>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="step" value="start" />
      <CurrentPassword id="totp-pw" />
      <FormError message={state?.error} />
      <SubmitButton block pendingLabel="Préparation…">Continuer</SubmitButton>
    </form>
  );
}

function RegenerateCodes({ close, onCodes }: { close: () => void; onCodes: ShowCodes }) {
  const [state, action] = useActionState(async (prev: TotpSetupState, form: FormData) => {
    const next = await regenerateCodesAction(prev, form);
    if (next?.codes) {
      close();
      onCodes(next.codes);
    }
    return next;
  }, null);
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">Les anciens codes ne fonctionneront plus.</p>
      <CurrentPassword id="codes-pw" />
      <FormError message={state?.error} />
      <SubmitButton block>Générer de nouveaux codes</SubmitButton>
    </form>
  );
}

export function TotpPanel({ enabled, recoveryLeft }: { enabled: boolean; recoveryLeft: number }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  return (
    <>
      <Sheet open={codes !== null} onOpenChange={(open) => !open && setCodes(null)} title="Codes de secours">
        {codes && <RecoveryCodes codes={codes} onClose={() => setCodes(null)} />}
      </Sheet>
      {enabled ? <TotpEnabled recoveryLeft={recoveryLeft} onCodes={setCodes} /> : <TotpDisabled onCodes={setCodes} />}
    </>
  );
}

function TotpDisabled({ onCodes }: { onCodes: ShowCodes }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Après le mot de passe, un code à 6 chiffres de votre téléphone : même avec votre mot de passe, personne ne peut entrer sans lui.</p>
      <SheetAction label="Activer le double facteur" title="Activer le double facteur" variant="primary" icon={<ShieldCheck aria-hidden className="size-4" />}>
        {(close) => <TotpSetup close={close} onCodes={onCodes} />}
      </SheetAction>
    </div>
  );
}

function TotpEnabled({ recoveryLeft, onCodes }: { recoveryLeft: number; onCodes: ShowCodes }) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 font-medium text-saving">
        <ShieldCheck aria-hidden className="size-5" /> Actif
      </p>
      <p className="text-sm text-muted">
        {recoveryLeft} code{recoveryLeft > 1 ? "s" : ""} de secours restant{recoveryLeft > 1 ? "s" : ""}.
      </p>
      <div className="flex flex-wrap gap-2">
        <SheetAction label="Nouveaux codes de secours" title="Nouveaux codes de secours">
          {(close) => <RegenerateCodes close={close} onCodes={onCodes} />}
        </SheetAction>
        <SheetAction label="Désactiver" title="Désactiver le double facteur ?" description="Votre compte ne sera plus protégé que par le mot de passe et vos passkeys." variant="ghost">
          {() => (
            <ActionForm action={disableTotpAction} className="space-y-4">
              <CurrentPassword id="totp-off-pw" />
              <SubmitButton block variant="danger">Désactiver</SubmitButton>
            </ActionForm>
          )}
        </SheetAction>
      </div>
    </div>
  );
}

// ───────────────────────── Appareils ─────────────────────────

export function SessionsPanel({ sessions, currentId }: { sessions: Omit<SessionInfo, "userId">[]; currentId: string }) {
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
            <span className="text-muted">{formatTimestamp(s.lastSeenAt, "date")}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
