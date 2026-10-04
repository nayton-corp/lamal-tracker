import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "./card";
import { LegalLinks } from "./legal-links";
import { Page, PageHeader } from "./page";

/** Page légale lisible sans compte : un texte en sections, puis les autres pages légales. */
export function LegalPage({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Page>
      <PageHeader title={title} subtitle={subtitle} />
      <Card className="space-y-4 leading-relaxed [&_h2]:pt-2 [&_h2]:font-semibold [&_a]:text-primary [&_a]:underline">{children}</Card>
      <p className="text-center text-sm">
        <Link href="/" className="inline-flex min-h-11 items-center text-primary underline">Retour à l&apos;accueil</Link>
      </p>
      <LegalLinks />
    </Page>
  );
}
