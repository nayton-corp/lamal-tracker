import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Conteneur de page. Étroit et centré sur téléphone ; sur ordinateur, `wide` ouvre la place
 * aux grilles (tableaux de bord), sinon la colonne reste lisible (formulaires, textes).
 */
export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <main
      id="contenu"
      className={cn("mx-auto max-w-xl space-y-6 px-4 pt-4 pb-28 lg:px-8 lg:pt-10 lg:pb-16", wide ? "md:max-w-3xl lg:max-w-5xl" : "md:max-w-2xl", className)}
    >
      {children}
    </main>
  );
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="space-y-1 pt-2">
      {back && (
        <Link href={back} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary">
          <ChevronLeft aria-hidden className="size-4" /> Retour
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-balance">{title}</h1>
        {action}
      </div>
      {subtitle && <p className="text-muted">{subtitle}</p>}
    </header>
  );
}

/** État vide ou page d'erreur ; `level` 1 quand l'état est toute la page (introuvable, erreur). */
export function EmptyState({ icon, title, children, action, level = 2 }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; level?: 1 | 2 }) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div>
      <Heading className="text-lg font-semibold">{title}</Heading>
      {children && <div className="max-w-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}
