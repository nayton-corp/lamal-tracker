import { ChevronRight, Download, Landmark } from "lucide-react";
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
export const metadata = { title: "Données" };

const STATUS = {
  ACTIVE: { label: "actif", tone: "saving" },
  SUPERSEDED: { label: "remplacé", tone: "neutral" },
  FAILED: { label: "refusé", tone: "increase" },
  IMPORTING: { label: "en cours", tone: "info" },
} as const;

export default function DataPage() {
  const datasets = db().select().from(tariffDataset).orderBy(desc(tariffDataset.id)).all();
  const params = db().select().from(lamalParameters).orderBy(desc(lamalParameters.year)).all();
  const insurers = listInsurers(db());
  const missingAddresses = insurers.filter((i) => !i.terminationAddress).length;
  const lastCheck = getSetting<{ at: string; ok: boolean }>(db(), "ofsp.lastCheck");

  return (
    <Page>
      <PageHeader title="Données" subtitle="Primes officielles, paramètres annuels et réglages." />

      <Section title="Primes officielles (OFSP)">
        <Card>
          <ImportPanel initial={importJob()} />
          <p className="mt-3 text-sm text-muted">
            Contrôle automatique : quotidien de mi-septembre à fin novembre, hebdomadaire sinon.
            {lastCheck && ` Dernier contrôle : ${new Date(lastCheck.at).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })}${lastCheck.ok ? "" : " (échec)"}.`}
          </p>
        </Card>
        {datasets.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {datasets.map((d) => {
              const report = d.report as ValidationReport | null;
              const s = STATUS[d.status];
              return (
                <li key={d.id} className="space-y-1 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold tabular">{d.year ?? "—"}</span>
                    <Badge tone={s.tone}>{s.label}</Badge>
                    <span className="ml-auto text-sm text-muted">{d.importedAt.slice(0, 10)}</span>
                  </div>
                  {report && (
                    <p className="text-sm text-muted">
                      {report.stats.rowsKept.toLocaleString("fr-CH")} primes · {report.stats.insurers} caisses · {report.stats.cantons} cantons
                      {report.stats.duplicates ? ` · ${report.stats.duplicates.toLocaleString("fr-CH")} doublons écartés` : ""}
                    </p>
                  )}
                  {report && [...report.errors, ...report.warnings].length > 0 && (
                    <details className="text-sm">
                      <summary className="min-h-11 cursor-pointer content-center text-primary">
                        {report.errors.length + report.warnings.length} remarque(s)
                      </summary>
                      <ul className="list-disc space-y-1 pl-5 text-muted">
                        {[...report.errors, ...report.warnings].map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="truncate text-xs text-muted" title={d.source}>
                    {d.source}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Redistribution CO2 (CHF par personne et par an)">
        <Card className="space-y-3">
          <p className="text-sm text-muted">
            Déduite de la prime par la caisse. Le montant change chaque année (2026 : 61.80, 2027 : 57.00) : il ne modifie pas le classement, seulement la prime nette affichée.
          </p>
          {params.map((p) => (
            <Co2Form key={p.year} year={p.year} amountRp={p.co2AnnualRp} />
          ))}
        </Card>
      </Section>

      <Section title="Caisses">
        <Link href="/donnees/caisses" className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:bg-surface-2">
          <Landmark aria-hidden className="size-5 text-primary" />
          <div className="flex-1">
            <p className="font-medium">Adresses de résiliation</p>
            <p className="text-sm text-muted">{missingAddresses} caisse(s) sans adresse sur {insurers.length}</p>
          </div>
          <ChevronRight aria-hidden className="size-5 text-muted" />
        </Link>
      </Section>

      <Section title="Notifications">
        <Card>
          <PushPanel devices={subscriptionCount(db())} />
        </Card>
      </Section>

      <Section title="Sauvegarde">
        <Card className="space-y-3">
          <p className="text-sm text-muted">Copie complète de la base (foyer, contrats, décisions, primes importées). À conserver hors du Pi.</p>
          <Button asChild variant="secondary" block>
            <a href="/api/backup" download={`primes-lamal-${today()}.db`}>
              <Download aria-hidden className="size-4" /> Télécharger une sauvegarde
            </a>
          </Button>
        </Card>
      </Section>
    </Page>
  );
}
