import { CheckCircle2, ChevronRight, Download, FolderLock, Landmark, MessageSquareText, ShieldCheck, UserRoundCog } from "lucide-react";
import Link from "next/link";
import { listInsurers } from "@/application/household";
import type { ValidationReport } from "@/domain/ofsp/report";
import { listDatasets, listParameters } from "@/application/reference-data";
import { getSetting, SETTING_KEYS } from "@/infrastructure/db/settings";
import { subscriptionCount } from "@/infrastructure/push/push";
import { currentYear, db } from "@/server/context";
import { importJob } from "@/server/jobs";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { Co2Form } from "./co2-form";
import { refreshReferenceAction } from "@/app/actions/data";
import { formatDateLong, formatTimestamp } from "@/domain/dates";
import { officialCo2 } from "@/infrastructure/reference/apply";
import type { ReferenceCheck } from "@/server/reference";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit";
import { ImportPanel } from "./import-panel";
import { PushPanel } from "./push-panel";
import { InstallHelp } from "@/ui/install-help";
import { LegalLinks } from "@/ui/legal-links";
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réglages" };

const STATUS = {
  ACTIVE: { label: "actif", tone: "saving" },
  SUPERSEDED: { label: "remplacé", tone: "neutral" },
  FAILED: { label: "refusé", tone: "increase" },
  IMPORTING: { label: "en cours", tone: "info" },
} as const;

export default async function DataPage() {
  const scope = await pageScope();
  const datasets = listDatasets(db());
  const year = currentYear();
  const activeYears = new Set(datasets.filter((d) => d.status === "ACTIVE").map((d) => d.year));
  // CO2 : années utiles seulement (primes importées, année en cours et suivante).
  const params = listParameters(db())
    .filter((p) => activeYears.has(p.year) || p.year >= year);
  const visibleDatasets = datasets.filter((d) => d.status !== "SUPERSEDED");
  const insurers = listInsurers(db());
  const customAddresses = insurers.filter((i) => i.terminationAddress?.trim()).length;
  const directoryDate = insurers.map((i) => i.directoryDate).filter(Boolean).sort().at(-1);
  const reference = getSetting<ReferenceCheck>(db(), SETTING_KEYS.referenceLastCheck);
  const lastCheck = getSetting<{ at: string; ok: boolean }>(db(), SETTING_KEYS.ofspLastCheck);

  return (
    <Page wide>
      <PageHeader title="Réglages" subtitle="Tout se met à jour tout seul : vous n'avez en principe rien à faire ici." />

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        {scope.isAdmin && (
        <div className="space-y-6">
          <Section title="Primes officielles">
            <Card className="space-y-4">
              <p className="text-sm text-muted">
                Publiées fin septembre par l&apos;OFSP, téléchargées automatiquement.
                {lastCheck && ` Dernière vérification : ${formatTimestamp(lastCheck.at, "dateTime")}${lastCheck.ok ? "" : " (échec, nouvel essai prévu)"}.`}
              </p>
              {visibleDatasets.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {visibleDatasets.map((d) => {
                    const report = d.report as ValidationReport | null;
                    const s = STATUS[d.status];
                    const notes = report ? [...report.errors, ...report.warnings] : [];
                    return (
                      <li key={d.id} className="px-3 py-2">
                        <div className="flex min-h-9 items-center gap-2">
                          {d.status === "ACTIVE" ? <CheckCircle2 aria-hidden className="size-4 text-saving" /> : <Badge tone={s.tone}>{s.label}</Badge>}
                          <span className="font-semibold tabular">Primes {d.year ?? "—"}</span>
                          {report && (
                            <span className="ml-auto text-sm text-muted">
                              {report.stats.insurers} caisses
                            </span>
                          )}
                        </div>
                        {notes.length > 0 && (
                          <details className="text-sm">
                            <summary className="min-h-9 cursor-pointer content-center text-muted">Détails techniques ({notes.length})</summary>
                            <ul className="list-disc space-y-1 pb-2 pl-5 text-muted">
                              {notes.map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <ImportPanel initial={importJob()} />
            </Card>
          </Section>

          <Section title="Redistribution CO2">
            <Card className="space-y-3">
              <p className="text-sm text-muted">
                Chaque année, la Confédération reverse à chaque habitant une part des taxes CO2 et COV, déduite de vos factures de caisse-maladie. Les montants (en CHF par personne et par an) sont repris de l&apos;Office fédéral de l&apos;environnement et se mettent à jour seuls.
              </p>
              <div className="divide-y divide-border">
                {params.map((p) => (
                  <Co2Form key={p.year} year={p.year} amountRp={p.co2AnnualRp} source={p.co2Source} officialRp={officialCo2(p.year)} />
                ))}
              </div>
            </Card>
          </Section>
        </div>
        )}

        <div className="space-y-6">
          {scope.isAdmin && (
            <>
          <Section title="Caisses-maladie">
            <Link href="/donnees/caisses" className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:bg-surface-2">
              <Landmark aria-hidden className="size-5 text-primary" />
              <div className="flex-1">
                <p className="font-medium">Adresses et contacts des caisses</p>
                <p className="text-sm text-muted">
                  Repris de l&apos;annuaire officiel{directoryDate ? ` du ${formatDateLong(directoryDate)}` : ""}
                  {customAddresses > 0 ? ` · ${customAddresses} adresse(s) modifiée(s) par vous` : ""}.
                </p>
              </div>
              <ChevronRight aria-hidden className="size-5 text-muted" />
            </Link>
          </Section>

          <Section title="Données officielles">
            <Card className="space-y-3">
              <p className="text-sm text-muted">
                Adresses des caisses, indicateurs (réserves, frais) et redistribution CO2 sont vérifiés chaque semaine auprès de l&apos;OFSP et de l&apos;OFEV.
                {reference && ` Dernière vérification : ${formatTimestamp(reference.at, "dateTime")}${reference.ok ? "" : " (en partie impossible, nouvel essai prévu)"}.`}
              </p>
              <ActionForm action={refreshReferenceAction}>
                <SubmitButton variant="secondary" size="sm" pendingLabel="Vérification…">
                  Vérifier maintenant
                </SubmitButton>
              </ActionForm>
            </Card>
          </Section>
            </>
          )}

          <Section title="Rappels">
            <Card>
              <PushPanel devices={subscriptionCount(db(), scope.userId)} />
            </Card>
          </Section>

          <Section title="Compte">
            <div className="space-y-3">
              <SettingsLink href="/compte" icon={<UserRoundCog aria-hidden className="size-5 text-primary" />} title="Mon compte" text="Courriel, mot de passe, passkeys, double facteur, appareils connectés." />
              <SettingsLink href="/compte/donnees" icon={<FolderLock aria-hidden className="size-5 text-primary" />} title="Mes données" text={scope.householdRole === "OWNER" ? "Télécharger une copie, supprimer le foyer ou le compte." : "Télécharger une copie, supprimer le compte."} />
              {scope.isAdmin && <SettingsLink href="/admin" icon={<ShieldCheck aria-hidden className="size-5 text-primary" />} title="Administration" text="Invitations, comptes, avis reçus, chiffres d'usage." />}
            </div>
          </Section>

          <Section title="L'app">
            <div className="space-y-3">
              <Card>
                <p className="mb-2 font-medium">Installer sur l&apos;écran d&apos;accueil</p>
                <InstallHelp />
              </Card>
              <SettingsLink href="/avis?depuis=/donnees" icon={<MessageSquareText aria-hidden className="size-5 text-primary" />} title="Donner un avis" text="Un problème, une idée, une phrase pas claire." />
              <LegalLinks />
            </div>
          </Section>

          {scope.isAdmin && (
          <Section title="Sauvegarde">
            <Card className="space-y-3">
              <p className="text-sm text-muted">Une copie de toute la base, tous foyers compris, après confirmation de votre identité.</p>
              <Button asChild variant="secondary" block>
                <Link href="/compte/donnees#sauvegarde">
                  <Download aria-hidden className="size-4" /> Télécharger une sauvegarde
                </Link>
              </Button>
            </Card>
          </Section>
          )}
        </div>
      </div>
    </Page>
  );
}

function SettingsLink({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:bg-surface-2">
      {icon}
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted">{text}</p>
      </div>
      <ChevronRight aria-hidden className="size-5 text-muted" />
    </Link>
  );
}
