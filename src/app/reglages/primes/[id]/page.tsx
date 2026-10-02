import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { activateDatasetAction, discardDatasetAction } from "@/app/actions";
import type { ValidationReport } from "@/application/import-tariffs";
import { AGE_CLASS_LABEL, type AgeClass } from "@/domain/age-class";
import { formatDateShort } from "@/domain/calendar";
import { MODEL_LABEL, type ModelType } from "@/domain/insurance-model";
import { formatChf, formatPercentBp } from "@/domain/money";
import { app } from "@/server/app";
import { ActionForm, SubmitButton } from "@/ui/action-form";
import { Badge, Card, CardTitle, Notice, PageHeader, Stat } from "@/ui/primitives";
import { DATASET_STATUS_LABEL, DATASET_STATUS_TONE } from "@/ui/settings/dataset-status";

export const metadata: Metadata = { title: "Rapport d'import" };

export default async function DatasetReportPage({ params }: PageProps<"/reglages/primes/[id]">) {
  const { id } = await params;
  const ctx = app();
  const ds = ctx.tariffs.getDataset(Number(id));
  if (!ds) notFound();
  const r = ds.validationReport as ValidationReport;
  const name = (insurerId: number) => ctx.tariffs.insurerName(insurerId);
  const yoy = r.yearOverYear;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Primes ${ds.year}`}
        back="/reglages/primes"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={DATASET_STATUS_TONE[ds.status]}>{DATASET_STATUS_LABEL[ds.status]}</Badge>
            <span className="truncate">{ds.fileName}</span>
          </span>
        }
      />

      {r.blocking.length > 0 && (
        <Notice tone="up" title="Activation impossible">
          <ul className="list-inside list-disc">
            {r.blocking.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Notice>
      )}
      {r.warnings.length > 0 && (
        <Notice tone="info" title="Points à vérifier">
          <ul className="list-inside list-disc">
            {r.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}

      {ds.status === "STAGING" && (
        <Card className="flex flex-col gap-3">
          <p className="text-sm">
            Vérifie le rapport ci-dessous. Une fois activées, ces primes remplacent l&apos;éventuel import précédent de {ds.year} et servent au rituel.
          </p>
          <ActionForm action={activateDatasetAction} className="gap-2">
            <input type="hidden" name="datasetId" value={ds.id} />
            <SubmitButton className="w-full">Activer les primes {ds.year}</SubmitButton>
          </ActionForm>
          <ActionForm action={discardDatasetAction} className="gap-2">
            <input type="hidden" name="datasetId" value={ds.id} />
            <SubmitButton variant="ghost" className="w-full">
              Abandonner cet import
            </SubmitButton>
          </ActionForm>
        </Card>
      )}
      {ds.status === "SUPERSEDED" && (
        <ActionForm action={activateDatasetAction} className="gap-2">
          <input type="hidden" name="datasetId" value={ds.id} />
          <SubmitButton variant="secondary">Réactiver cette version</SubmitButton>
        </ActionForm>
      )}

      <Card>
        <CardTitle>Lecture du fichier</CardTitle>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Tarifs importés" value={r.rowsImported.toLocaleString("fr-CH")} />
          <Stat label="Lignes rejetées" value={r.rowsRejected.toLocaleString("fr-CH")} tone={r.rowsRejected > 0 ? "up" : undefined} />
          <Stat label="Assureurs" value={r.insurerCount} />
          <Stat label="Doublons ignorés" value={r.duplicates} />
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Source</dt>
          <dd className="truncate">{ds.sourceUrl ? <a className="text-primary underline" href={ds.sourceUrl}>{ds.sourceLabel}</a> : ds.sourceLabel}</dd>
          <dt className="text-muted">Importé le</dt>
          <dd>{formatDateShort(ds.importedAt.slice(0, 10))}</dd>
          <dt className="text-muted">Fichier lu</dt>
          <dd className="truncate">
            {r.csvName} · {r.encoding} · séparateur « {r.delimiter} »
          </dd>
          {r.unknownColumns.length > 0 && (
            <>
              <dt className="text-muted">Colonnes ignorées</dt>
              <dd className="truncate">{r.unknownColumns.join(", ")}</dd>
            </>
          )}
        </dl>
        {r.errorExamples.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">Exemples de lignes rejetées</summary>
            <ul className="num text-xs text-muted">
              {r.errorExamples.map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  Ligne {e.line} : {e.message}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {yoy && (
        <Card>
          <CardTitle>Évolution par rapport à {yoy.previousYear}</CardTitle>
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Hausse médiane"
              value={yoy.medianChangeBp !== null ? formatPercentBp(yoy.medianChangeBp) : "–"}
              tone={yoy.medianChangeBp !== null && yoy.medianChangeBp > 0 ? "up" : "down"}
            />
            <Stat label="Produits comparés" value={yoy.comparedProducts.toLocaleString("fr-CH")} />
          </div>
          {Object.keys(yoy.medianChangeBpByCanton).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(yoy.medianChangeBpByCanton).map(([canton, bp]) => (
                <Badge key={canton} tone={bp > 0 ? "up" : "down"}>
                  {canton} {formatPercentBp(bp)}
                </Badge>
              ))}
            </div>
          )}
          {yoy.bigChanges.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">{yoy.bigChangeCount} variations de plus de 30 %</summary>
              <ul className="num text-xs">
                {yoy.bigChanges.map((c) => (
                  <li key={`${c.insurerId}-${c.tariffCode}-${c.canton}-${c.region}`} className="border-b border-border py-1">
                    {name(c.insurerId)} · {c.tariffCode} · {c.canton}
                    {c.region} : {formatChf(c.fromRp)} → {formatChf(c.toRp)} ({formatPercentBp(c.changeBp)})
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      <Card>
        <CardTitle>Contenu</CardTitle>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Modèles détectés</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Object.entries(r.byModel).map(([m, n]) => (
            <Badge key={m}>
              {MODEL_LABEL[m as ModelType] ?? m} · {n.toLocaleString("fr-CH")}
            </Badge>
          ))}
        </div>
        {r.subgroups.length > 0 && (
          <>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Sous-groupes d&apos;âge</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {r.subgroups.map((s) => (
                <Badge key={`${s.ageClass}-${s.subgroup}`}>
                  {AGE_CLASS_LABEL[s.ageClass as AgeClass] ?? s.ageClass} {s.subgroup || "–"} · {s.n.toLocaleString("fr-CH")}
                </Badge>
              ))}
            </div>
          </>
        )}
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Cantons</p>
        <p className="num text-sm">
          {Object.keys(r.byCanton).length} cantons
          {r.missingCantons.length > 0 && <span className="text-up"> · manquants : {r.missingCantons.join(", ")}</span>}
        </p>
        {r.insurersWithoutStandard.length > 0 && (
          <p className="mt-2 text-sm text-muted">Sans modèle standard détecté : {r.insurersWithoutStandard.map(name).join(", ")}.</p>
        )}
        {r.outOfBoundsCount > 0 && (
          <p className="mt-2 text-sm text-up">{r.outOfBoundsCount} primes hors des bornes plausibles.</p>
        )}
      </Card>
    </div>
  );
}
