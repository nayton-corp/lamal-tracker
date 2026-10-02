import { CheckCircle2, ChevronRight, Download, Landmark } from "lucide-react";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { listInsurers } from "@/application/household";
import type { ValidationReport } from "@/domain/ofsp/report";
import { lamalParameters, tariffDataset } from "@/infrastructure/db/schema";
import { getSetting } from "@/infrastructure/db/settings";
import { subscriptionCount } from "@/infrastructure/push/push";
import { db, today } from "@/server/context";
import { importJob } from "@/server/jobs";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { Co2Form } from "./co2-form";
import { ImportPanel } from "./import-panel";
import { PushPanel } from "./push-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Réglages" };

const STATUS = {
  ACTIVE: { label: "actif", tone: "saving" },
  SUPERSEDED: { label: "remplacé", tone: "neutral" },
  FAILED: { label: "refusé", tone: "increase" },
  IMPORTING: { label: "en cours", tone: "info" },
} as const;

export default function DataPage() {
  const datasets = db().select().from(tariffDataset).orderBy(desc(tariffDataset.id)).all();
  const currentYear = Number(today().slice(0, 4));
  const activeYears = new Set(datasets.filter((d) => d.status === "ACTIVE").map((d) => d.year));
  // CO2 : années utiles seulement (primes importées, année en cours et suivante).
  const params = db()
    .select()
    .from(lamalParameters)
    .orderBy(desc(lamalParameters.year))
    .all()
    .filter((p) => activeYears.has(p.year) || p.year >= currentYear);
  const visibleDatasets = datasets.filter((d) => d.status !== "SUPERSEDED");
  const insurers = listInsurers(db());
  const missingAddresses = insurers.filter((i) => !i.terminationAddress).length;
  const lastCheck = getSetting<{ at: string; ok: boolean }>(db(), "ofsp.lastCheck");

  return (
    <Page wide>
      <PageHeader title="Réglages" subtitle="Tout se met à jour tout seul : vous n'avez en principe rien à faire ici." />

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-6">
          <Section title="Primes officielles">
            <Card className="space-y-4">
              <p className="text-sm text-muted">
                L&apos;Office fédéral de la santé publique (OFSP) publie fin septembre les primes de toutes les caisses. L&apos;app les télécharge seule, chaque jour de mi-septembre à fin novembre.
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
                Chaque année, la Confédération reverse à chaque habitant une part de la taxe CO2, déduite de vos factures de caisse-maladie. Le montant (en CHF par personne et par an) est déjà rempli ; corrigez-le seulement s&apos;il est différent sur votre facture.
              </p>
              {params.map((p) => (
                <Co2Form key={p.year} year={p.year} amountRp={p.co2AnnualRp} />
              ))}
            </Card>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Caisses-maladie">
            <Link href="/donnees/caisses" className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:bg-surface-2">
              <Landmark aria-hidden className="size-5 text-primary" />
              <div className="flex-1">
                <p className="font-medium">Adresses pour les lettres de résiliation</p>
                <p className="text-sm text-muted">Seules les caisses que vous quittez ont besoin d&apos;une adresse ({insurers.length - missingAddresses} renseignée(s)).</p>
              </div>
              <ChevronRight aria-hidden className="size-5 text-muted" />
            </Link>
          </Section>

          <Section title="Rappels">
            <Card>
              <PushPanel devices={subscriptionCount(db())} />
            </Card>
          </Section>

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
        </div>
      </div>
    </Page>
  );
}
