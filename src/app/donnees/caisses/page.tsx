import { notFound } from "next/navigation";
import { BadgeCheck, Globe, Mail, Phone } from "lucide-react";
import { getHousehold, listInsurers, listPersons, listPolicies } from "@/application/household";
import { formatDateLong } from "@/domain/dates";
import { insurerAddressLines, insurerLabel } from "@/infrastructure/db/queries";
import { db } from "@/server/context";
import { Section } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { InsurerForm } from "./insurer-form";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caisses" };

type InsurerRow = ReturnType<typeof listInsurers>[number];

export default async function InsurersPage() {
  const scope = await pageScope();
  // Coordonnées des caisses : partagées par tous les foyers, modifiables par l'administrateur seul.
  if (!scope.admin) notFound();
  const insurers = listInsurers(db())
    .filter((i) => i.officialAddress || i.terminationAddress)
    .sort((a, b) => insurerLabel(a).localeCompare(insurerLabel(b), "fr"));
  const h = getHousehold(db(), scope);
  const mine = new Set(h ? listPersons(db(), h.id).flatMap((p) => listPolicies(db(), p.id).map((x) => x.policy.insurerId)) : []);
  const yours = insurers.filter((i) => mine.has(i.id));
  const others = insurers.filter((i) => !mine.has(i.id));
  const date = insurers.map((i) => i.directoryDate).filter(Boolean).sort().at(-1);
  return (
    <Page>
      <PageHeader
        title="Caisses-maladie"
        subtitle={`Annuaire officiel OFSP${date ? ` (${formatDateLong(date)})` : ""}. Modifiez seulement si votre police indique une autre adresse.`}
        back="/donnees"
      />
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

function InsurerList({ insurers }: { insurers: InsurerRow[] }) {
  return (
    <ul className="space-y-2">
      {insurers.map((i) => {
        const custom = Boolean(i.terminationAddress?.trim());
        return (
          <li key={i.id}>
            <details className="rounded-2xl border border-border bg-surface px-4 shadow-card">
              <summary className="flex min-h-14 cursor-pointer items-center gap-2">
                <span className="flex-1 font-medium">{insurerLabel(i)}</span>
                <span className="text-sm text-muted">{custom ? "votre adresse" : <BadgeCheck aria-label="adresse officielle" className="size-5 text-saving" />}</span>
              </summary>
              <div className="space-y-3 pb-4">
                <div className="rounded-xl bg-surface-2 p-3 text-sm">
                  <p className="text-muted">{custom ? "Adresse de résiliation (saisie par vous)" : "Adresse de résiliation (annuaire officiel)"}</p>
                  <address className="not-italic">
                    <span className="block font-medium">{i.legalNameFr || i.name}</span>
                    {insurerAddressLines(i).map((l) => (
                      <span key={l} className="block">
                        {l}
                      </span>
                    ))}
                  </address>
                </div>
                <ul className="space-y-1 text-sm">
                  {i.phone && (
                    <li>
                      <a className="inline-flex min-h-9 items-center gap-2 text-primary" href={`tel:${i.phone.replace(/\s/g, "")}`}>
                        <Phone aria-hidden className="size-4" /> {i.phone}
                      </a>
                    </li>
                  )}
                  {i.email && (
                    <li>
                      <a className="inline-flex min-h-9 items-center gap-2 text-primary" href={`mailto:${i.email}`}>
                        <Mail aria-hidden className="size-4" /> {i.email}
                      </a>
                    </li>
                  )}
                  {i.website && (
                    <li>
                      <a className="inline-flex min-h-9 items-center gap-2 text-primary" href={i.website} target="_blank" rel="noreferrer">
                        <Globe aria-hidden className="size-4" /> {i.website.replace(/^https?:\/\//, "")}
                      </a>
                    </li>
                  )}
                </ul>
                <InsurerForm insurer={i} />
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
