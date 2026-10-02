import { CheckCircle2 } from "lucide-react";
import { getHousehold, listInsurers, listPersons, listPolicies } from "@/application/household";
import { insurerLabel } from "@/infrastructure/db/queries";
import { db } from "@/server/context";
import { Section } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { InsurerForm } from "./insurer-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caisses" };

export default function InsurersPage() {
  const insurers = listInsurers(db()).sort((a, b) => insurerLabel(a).localeCompare(insurerLabel(b), "fr"));
  const h = getHousehold(db());
  const mine = new Set(h ? listPersons(db(), h.id).flatMap((p) => listPolicies(db(), p.id).map((x) => x.policy.insurerId)) : []);
  const yours = insurers.filter((i) => mine.has(i.id));
  const others = insurers.filter((i) => !mine.has(i.id));
  return (
    <Page>
      <PageHeader title="Adresses des caisses" subtitle="Elles servent à adresser vos lettres de résiliation. Recopiez celle indiquée sur votre police ou sur le site de la caisse." back="/donnees" />
      {yours.length > 0 && (
        <Section title="Vos caisses">
          <InsurerList insurers={yours} />
        </Section>
      )}
      <Section title={yours.length > 0 ? "Autres caisses" : "Toutes les caisses"}>
        <InsurerList insurers={others} />
      </Section>
    </Page>
  );
}

function InsurerList({ insurers }: { insurers: ReturnType<typeof listInsurers> }) {
  return (
    <ul className="space-y-2">
      {insurers.map((i) => (
        <li key={i.id}>
          <details className="rounded-2xl border border-border bg-surface px-4 shadow-card">
            <summary className="flex min-h-14 cursor-pointer items-center gap-2">
              <span className="flex-1 font-medium">{insurerLabel(i)}</span>
              {i.terminationAddress ? (
                <CheckCircle2 aria-label="adresse saisie" className="size-5 text-saving" />
              ) : (
                <span className="text-sm text-muted">adresse à saisir</span>
              )}
            </summary>
            <div className="pb-4">
              <InsurerForm insurer={i} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
