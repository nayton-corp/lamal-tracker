"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/ui/button";
import { EmptyState, Page } from "@/ui/page";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Page>
      <EmptyState icon={<TriangleAlert aria-hidden />} title="Une erreur est survenue" action={<Button onClick={reset}>Réessayer</Button>}>
        {error.message || "Erreur inattendue."} {error.digest && <span className="block text-xs">Réf. {error.digest}</span>}
      </EmptyState>
    </Page>
  );
}
