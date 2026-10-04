"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/ui/button";
import { EmptyState, Page } from "@/ui/page";

/**
 * Erreur imprévue dans une page. Le message technique n'est pas montré (il peut être obscur) ;
 * la référence permet de retrouver l'erreur dans le journal du serveur.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  return (
    <Page>
      <EmptyState
        icon={<TriangleAlert aria-hidden />}
        title="Quelque chose n'a pas marché"
        level={1}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={reset}>Réessayer</Button>
            <Button asChild variant="secondary">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          </div>
        }
      >
        <p>
          Rien de ce que vous aviez enregistré n&apos;est perdu. Réessayez dans un instant ; si le problème revient,{" "}
          <Link href={`/avis?depuis=${encodeURIComponent(pathname)}`} className="text-primary underline">signalez-le</Link>.
        </p>
        {error.digest && <p className="mt-2 text-xs">Référence : {error.digest}</p>}
      </EmptyState>
    </Page>
  );
}
