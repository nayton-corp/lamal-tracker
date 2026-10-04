import Link from "next/link";
import { cn } from "./cn";

/** Liens vers les pages légales, lisibles sans compte (présentation, inscription, réglages). */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Informations légales" className={cn("flex flex-wrap justify-center gap-x-4 text-sm", className)}>
      <Link href="/confidentialite" className="inline-flex min-h-11 items-center text-muted underline hover:text-foreground">Confidentialité</Link>
      <Link href="/conditions" className="inline-flex min-h-11 items-center text-muted underline hover:text-foreground">Conditions d&apos;utilisation</Link>
      <Link href="/mentions-legales" className="inline-flex min-h-11 items-center text-muted underline hover:text-foreground">Mentions légales</Link>
    </nav>
  );
}
