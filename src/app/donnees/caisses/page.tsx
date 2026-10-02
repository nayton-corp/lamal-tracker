import { CheckCircle2 } from "lucide-react";
import { listInsurers } from "@/application/household";
import { insurerLabel } from "@/infrastructure/db/queries";
import { db } from "@/server/context";
import { Page, PageHeader } from "@/ui/page";
import { InsurerForm } from "./insurer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caisses" };

export default function InsurersPage() {
  const insurers = listInsurers(db()).sort((a, b) => insurerLabel(a).localeCompare(insurerLabel(b), "fr"));
  return (
    <Page>
      <PageHeader title="Caisses-maladie" subtitle="Adresses utilisées pour les lettres. Vérifiez-les sur votre police : elles changent parfois." back="/donnees" />
      <ul className="space-y-2">
        {insurers.map((i) => (
          <li key={i.id}>
            <details className="rounded-2xl border border-border bg-surface px-4 shadow-card">
              <summary className="flex min-h-14 cursor-pointer items-center gap-2">
                <span className="flex-1 font-medium">{insurerLabel(i)}</span>
                <span className="text-xs text-muted tabular">n° {i.bagNumber}</span>
                {i.terminationAddress && <CheckCircle2 aria-label="adresse saisie" className="size-5 text-saving" />}
              </summary>
              <div className="pb-4">
                <InsurerForm insurer={i} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Page>
  );
}
