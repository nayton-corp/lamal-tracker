import type { Metadata } from "next";
import { saveSettingAction } from "@/app/actions";
import { formatDateShort } from "@/domain/calendar";
import { reviewTargetYear } from "@/domain/deadlines";
import { DEFAULT_SEARCH_URL } from "@/infrastructure/ofsp/fetcher";
import { app } from "@/server/app";
import { ActionForm, SubmitButton } from "@/ui/action-form";
import { Badge, Card, CardTitle, Input, ListRow, PageHeader } from "@/ui/primitives";
import { DatasetImportForm, FetchNowButton } from "@/ui/settings/dataset-import";
import { DATASET_STATUS_LABEL as STATUS_LABEL, DATASET_STATUS_TONE as STATUS_TONE } from "@/ui/settings/dataset-status";

export const metadata: Metadata = { title: "Primes OFSP" };

export default function DatasetsPage() {
  const ctx = app();
  const target = reviewTargetYear(ctx.clock.today());
  const datasets = ctx.tariffs.listDatasets();
  const autoFetch = ctx.system.setting<boolean>("autoFetch") !== false;
  const override = ctx.system.setting<string>("datasetUrlOverride") ?? "";
  const searchUrl = ctx.system.setting<string>("datasetSearchUrl") ?? "";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Primes OFSP" back="/reglages" subtitle="Primes officielles approuvées, publiées fin septembre" />

      <Card>
        <CardTitle>Importer un fichier</CardTitle>
        <p className="mb-3 text-sm text-muted">
          Télécharge le fichier des primes sur opendata.swiss ou priminfo.admin.ch (ZIP ou CSV « Prämien »), puis envoie-le ici. Chaque import est vérifié avant
          d&apos;être utilisé.
        </p>
        <DatasetImportForm defaultYear={target} />
      </Card>

      <Card>
        <CardTitle>Téléchargement automatique</CardTitle>
        <p className="mb-3 text-sm text-muted">
          Dès mi-septembre, le Pi cherche chaque jour les primes {target} sur opendata.swiss. Un import trouvé reste en attente de ta validation.
        </p>
        <ActionForm action={saveSettingAction} className="mb-3 gap-2">
          <input type="hidden" name="key" value="autoFetch" />
          <label className="flex min-h-12 items-center gap-3 text-sm font-medium">
            <input type="checkbox" name="value" defaultChecked={autoFetch} className="size-5 accent-[var(--primary)]" />
            Rechercher automatiquement
          </label>
          <SubmitButton variant="secondary">Enregistrer</SubmitButton>
        </ActionForm>
        <FetchNowButton year={target} />
        <details className="mt-3 text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">Sources avancées</summary>
          <div className="flex flex-col gap-4 pt-2">
            <ActionForm action={saveSettingAction} className="gap-2">
              <input type="hidden" name="key" value="datasetUrlOverride" />
              <label htmlFor="override" className="font-medium">
                URL directe du fichier (prioritaire)
              </label>
              <Input id="override" name="value" type="url" defaultValue={override} placeholder="https://…/praemien.zip" />
              <SubmitButton variant="secondary">Enregistrer</SubmitButton>
            </ActionForm>
            <ActionForm action={saveSettingAction} className="gap-2">
              <input type="hidden" name="key" value="datasetSearchUrl" />
              <label htmlFor="search" className="font-medium">
                URL de recherche CKAN
              </label>
              <Input id="search" name="value" type="url" defaultValue={searchUrl} placeholder={DEFAULT_SEARCH_URL} />
              <SubmitButton variant="secondary">Enregistrer</SubmitButton>
            </ActionForm>
          </div>
        </details>
      </Card>

      <Card className="py-1">
        <CardTitle className="mt-3">Imports</CardTitle>
        {datasets.length === 0 ? (
          <p className="pb-3 text-sm text-muted">Aucun import pour l&apos;instant.</p>
        ) : (
          <ul>
            {datasets.map((d) => (
              <li key={d.id}>
                <ListRow href={`/reglages/primes/${d.id}`} trailing={<Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>}>
                  <p className="font-semibold">Primes {d.year}</p>
                  <p className="num truncate text-sm text-muted">
                    {d.rowCount.toLocaleString("fr-CH")} tarifs · {formatDateShort(d.importedAt.slice(0, 10))}
                  </p>
                  <p className="truncate text-xs text-muted">{d.fileName}</p>
                </ListRow>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
