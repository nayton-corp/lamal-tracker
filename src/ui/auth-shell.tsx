import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./card";
import { Page } from "./page";

/** Écrans d'accès (connexion, inscription, réinitialisation) : une carte centrée, sans navigation. */
export function AuthShell({ icon: Icon, title, subtitle, children, footer }: { icon: LucideIcon; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Page className="flex min-h-[80dvh] flex-col justify-center">
      <Card className="space-y-5">
        <div className="flex items-center gap-3">
          <Icon aria-hidden className="size-8 shrink-0 text-primary" />
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
        </div>
        {children}
      </Card>
      {footer && <div className="space-y-2 text-center text-sm">{footer}</div>}
    </Page>
  );
}
