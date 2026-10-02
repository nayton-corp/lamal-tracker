"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { acknowledgeLcaAction } from "@/app/actions/review";
import { Checkbox } from "@/ui/form";
import { HoldButton } from "@/ui/hold-button";

export function LcaConfirm({ lineId, person, currentInsurer, acknowledgedAt }: { lineId: number; person: string; currentInsurer: string; acknowledgedAt: string | null }) {
  const router = useRouter();
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (acknowledgedAt) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-saving-soft p-3 text-sm font-medium text-saving">
        <CheckCircle2 aria-hidden className="size-5" /> Confirmé le {new Date(acknowledgedAt).toLocaleDateString("fr-CH")}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Checkbox
        checked={understood}
        onChange={(e) => setUnderstood(e.target.checked)}
        label={`Je comprends que seule l'assurance de base LAMal de ${person} chez ${currentInsurer} est résiliée, et que ses complémentaires LCA restent actives.`}
      />
      <HoldButton
        disabled={!understood}
        onConfirm={async () => {
          const res = await acknowledgeLcaAction(lineId);
          if (res?.error) setError(res.error);
          router.refresh();
        }}
      >
        Maintenir pour confirmer
      </HoldButton>
      {error && <p className="text-sm text-increase" role="alert">{error}</p>}
    </div>
  );
}
