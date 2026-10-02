import type { Metadata } from "next";
import { listBackups } from "@/infrastructure/jobs/scheduler";
import { app } from "@/server/app";
import { buttonClass, Card, CardTitle, ListRow, PageHeader } from "@/ui/primitives";
import { PushToggle } from "@/ui/settings/push-toggle";

export const metadata: Metadata = { title: "Réglages" };

function size(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(bytes / 1024)} Ko`;
}

export default function SettingsPage() {
  const ctx = app();
  const datasets = ctx.tariffs.listDatasets();
  const active = ctx.tariffs.activeYears();
  const backups = listBackups().slice(0, 5);
  const jobs = ctx.system.recentJobs(6);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Réglages" back="/" />
      <Card className="py-1">
        <ul>
          <li>
            <ListRow href="/reglages/primes">
              <p className="font-semibold">Primes OFSP</p>
              <p className="text-sm text-muted">
                {active.length ? `Actives : ${active.join(", ")}` : "Aucune prime active"}
                {datasets.some((d) => d.status === "STAGING") && " · import à valider"}
              </p>
            </ListRow>
          </li>
          <li>
            <ListRow href="/reglages/assureurs">
              <p className="font-semibold">Assureurs et adresses</p>
              <p className="text-sm text-muted">Noms et adresses de résiliation</p>
            </ListRow>
          </li>
          <li>
            <ListRow href="/reglages/parametres">
              <p className="font-semibold">Paramètres LAMal et CO2</p>
              <p className="text-sm text-muted">Franchises, quote-part, redistribution</p>
            </ListRow>
          </li>
          <li>
            <ListRow href="/reglages/modeles">
              <p className="font-semibold">Modèles d&apos;assurance</p>
              <p className="text-sm text-muted">Corriger la classification d&apos;un produit</p>
            </ListRow>
          </li>
        </ul>
      </Card>

      <Card>
        <CardTitle>Notifications</CardTitle>
        <p className="mb-3 text-sm text-muted">Sortie des primes, rappels avant le 30 novembre, confirmations de résiliation.</p>
        <PushToggle />
      </Card>

      <Card>
        <CardTitle>Sauvegardes</CardTitle>
        <p className="mb-3 text-sm text-muted">Une copie de la base est faite chaque jour sur le Pi (14 jours conservés).</p>
        {backups.length > 0 && (
          <ul className="mb-3 text-sm">
            {backups.map((b) => (
              <li key={b.name} className="num flex justify-between border-b border-border py-1.5 last:border-b-0">
                <span>{b.name}</span>
                <span className="text-muted">{size(b.size)}</span>
              </li>
            ))}
          </ul>
        )}
        <a href="/api/backup" className={buttonClass("secondary", "w-full")} download>
          Télécharger une sauvegarde maintenant
        </a>
      </Card>

      {jobs.length > 0 && (
        <Card>
          <CardTitle>Tâches automatiques</CardTitle>
          <ul className="text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="border-b border-border py-1.5 last:border-b-0">
                <p className="flex justify-between gap-2">
                  <span className="font-medium">{j.job === "backup" ? "Sauvegarde" : "Tâche du jour"}</span>
                  <span className={j.ok ? "text-down" : j.ok === false ? "text-up" : "text-muted"}>{j.ok ? "OK" : j.ok === false ? "Échec" : "En cours"}</span>
                </p>
                <p className="num text-xs text-muted">
                  {j.startedAt.slice(0, 16).replace("T", " ")} · {j.message}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
