"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/ui/button";
import { usePasskeySupport } from "@/ui/media";
import { AddPasskey } from "../panels";

export function PasskeyOffer({ next, already, askPassword }: { next: string; already: boolean; askPassword: boolean }) {
  const router = useRouter();
  const supported = usePasskeySupport();
  // Appareil sans passkey possible (ou déjà équipé) : on passe directement à la suite.
  useEffect(() => {
    if (supported === false || already) router.replace(next);
  }, [supported, already, next, router]);
  return (
    <div className="space-y-3">
      <AddPasskey block askPassword={askPassword} label="Activer la passkey" onDone={() => setTimeout(() => router.replace(next), 1200)} />
      <Button asChild variant="ghost" block>
        <Link href={next}>Plus tard</Link>
      </Button>
    </div>
  );
}
