"use client";

import { Check, Copy, Loader2, Share2, UserPlus } from "lucide-react";
import { useState } from "react";
import { createHouseholdInviteAction } from "@/app/actions/members";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { FormError, Input } from "@/ui/form";

/** Crée un lien d'invitation et le propose au partage (menu de partage du téléphone, ou copie). */
export function InvitePanel() {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create() {
    setPending(true);
    setError(null);
    const res = await createHouseholdInviteAction();
    setPending(false);
    if (res?.link) setLink(res.link);
    else setError(res?.error ?? "Impossible de créer l'invitation.");
  }

  if (link) {
    const canShare = typeof navigator !== "undefined" && "share" in navigator;
    return (
      <div className="space-y-3">
        <Alert tone="success" title="Invitation prête">Transmettez ce lien à la personne invitée. Il est valable 48 heures et ne sert qu&apos;une fois.</Alert>
        <Input readOnly value={link} aria-label="Lien d'invitation" onFocus={(e) => e.currentTarget.select()} />
        <div className="flex flex-wrap gap-2">
          {canShare && (
            <Button size="sm" onClick={() => void navigator.share({ title: "Invitation Primes LAMal", text: "Rejoins notre foyer sur Primes LAMal :", url: link }).catch(() => {})}>
              <Share2 aria-hidden className="size-4" /> Partager
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} {copied ? "Copié" : "Copier le lien"}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Button onClick={create} disabled={pending}>
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <UserPlus aria-hidden className="size-4" />}
        Inviter une personne
      </Button>
      <FormError message={error} />
    </div>
  );
}
