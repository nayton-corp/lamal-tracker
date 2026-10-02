"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acknowledgeLcaAction } from "@/app/actions/review";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/form";

export function LcaConfirm({ lineId, person, currentInsurer, acknowledgedAt }: { lineId: number; person: string; currentInsurer: string; acknowledgedAt: string | null }) {
  const router = useRouter();
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (acknowledgedAt) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-saving-soft p-3 text-sm font-medium text-saving">
        <CheckCircle2 aria-hidden className="size-5" /> Confirmé le {new Date(acknowledgedAt).toLocaleDateString("fr-CH")}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Checkbox checked={understood} onChange={(e) => setUnderstood(e.target.checked)} label={`Seule l'assurance de base de ${person} chez ${currentInsurer} est résiliée ; ses complémentaires restent actives.`} />
      <Button
        block
        variant="lca"
        disabled={!understood || pending}
        onClick={() =>
          start(async () => {
            const res = await acknowledgeLcaAction(lineId);
            if (res?.error) setError(res.error);
            router.refresh();
          })
        }
      >
        {pending ? "Confirmation…" : "J'ai compris, confirmer"}
      </Button>
      {error && <p className="text-sm text-increase" role="alert">{error}</p>}
    </div>
  );
}
