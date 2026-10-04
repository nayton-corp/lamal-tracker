import { CheckCircle2, ChevronRight, Download, Landmark } from "lucide-react";
import Link from "next/link";
import { listInsurers } from "@/application/household";
import type { ValidationReport } from "@/domain/ofsp/report";
import { listDatasets, listParameters } from "@/application/reference-data";
import { getSetting } from "@/infrastructure/db/settings";
import { subscriptionCount } from "@/infrastructure/push/push";
import { db, today } from "@/server/context";
import { importJob } from "@/server/jobs";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { Co2Form } from "./co2-form";
import { refreshReferenceAction } from "@/app/actions/data";
import { formatDateLong } from "@/domain/dates";
import { officialCo2 } from "@/infrastructure/reference/apply";
import type { ReferenceCheck } from "@/server/reference";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit";
import { ImportPanel } from "./import-panel";
import { PushPanel } from "./push-panel";
import { SecurityPanel } from "./security-panel";
import { listSessions } from "@/application/auth";
import { pageScope } from "@/server/auth";
import { nowIso } from "@/server/context";

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
  const currentYear = Number(today().slice(0, 4));
  const activeYears = new Set(datasets.filter((d) => d.status === "ACTIVE").map((d) => d.year));
  // CO2 : années utiles seulement (primes importées, année en cours et suivante).
  const params = listParameters(db())
    .filter((p) => activeYears.has(p.year) || p.year >= currentYear);
  const visibleDatasets = datasets.filter((d) => d.status !== "SUPERSEDED");
  const insurers = listInsurers(db());
  const customAddresses = insurers.filter((i) => i.terminationAddress?.trim()).length;
  const directoryDate = insurers.map((i) => i.directoryDate).filter(Boolean).sort().at(-1);
  const reference = getSetting<ReferenceCheck>(db(), "reference.lastCheck");
  const lastCheck = getSetting<{ at: string; ok: boolean }>(db(), "ofsp.lastCheck");

  return (
    <Page wide>
      <PageHeader title="Réglages" subtitle="Tout se met à jour tout seul : vous n'avez en principe rien à faire ici." />

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        {scope.admin && (
        <div className="space-y-6">
          <Section title="Primes officielles">
            <Card className="space-y-4">
              <p className="text-sm text-muted">
                Publiées fin septembre par l&apos;OFSP, téléchargées automatiquement.
                {lastCheck && ` Dernière vérification : ${new Date(lastCheck.at).toLocaleString("fr-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" })}${lastCheck.ok ? "" : " (échec, nouvel essai prévu)"}.`}
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
          {scope.admin && (
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
                {reference && ` Dernière vérification : ${new Date(reference.at).toLocaleString("fr-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" })}${reference.ok ? "" : " (en partie impossible, nouvel essai prévu)"}.`}
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

          <Section title="Sécurité">
            <Card>
              <SecurityPanel sessions={listSessions(db(), scope.userId, nowIso())} currentId={scope.sessionId} />
            </Card>
          </Section>

          {scope.admin && (
          <Section title="Sauvegarde">
            <Card className="space-y-3">
              <p className="text-sm text-muted">Une copie de tout ce que vous avez saisi (foyer, contrats, choix). Gardez-la ailleurs, par exemple sur une clé USB, au cas où.</p>
              <Button asChild variant="secondary" block>
                <a href="/api/backup" download={`primes-lamal-${today()}.db`}>
                  <Download aria-hidden className="size-4" /> Télécharger une sauvegarde
                </a>
              </Button>
            </Card>
          </Section>
          )}
        </div>
      </div>
    </Page>
  );
}
