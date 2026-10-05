"use client";

import { Share2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/ui/button";

/** Partage du PDF (impression, e-mail, AirDrop…) via le menu de partage du téléphone. */
export function ShareButton({ url, filename }: { url: string; filename: string }) {
  const canShare = useSyncExternalStore(
    () => () => {},
    () => "canShare" in navigator && navigator.canShare({ files: [new File([""], "t.pdf", { type: "application/pdf" })] }),
    () => false,
  );
  if (!canShare) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        const blob = await (await fetch(url)).blob();
        try {
          await navigator.share({ files: [new File([blob], filename, { type: "application/pdf" })], title: filename });
        } catch {
          // partage annulé
        }
      }}
    >
      <Share2 aria-hidden className="size-4" /> Partager
    </Button>
  );
}
