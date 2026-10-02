import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main id="contenu" className={cn("mx-auto max-w-xl space-y-6 px-4 pt-4 pb-28", className)}>{children}</main>;
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

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div>
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="max-w-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}
