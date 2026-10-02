"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, inputClass } from "../primitives";

/** Envoi du fichier OFSP (CSV ou ZIP, jusqu'à 200 Mo) puis ouverture du rapport d'import. */
export function DatasetImportForm({ defaultYear }: { defaultYear: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/datasets/import", { method: "POST", body: new FormData(e.currentTarget) });
      const json = (await res.json()) as { ok: boolean; message?: string; datasetId?: number };
      if (!json.ok || !json.datasetId) throw new Error(json.message ?? "Import impossible.");
      router.push(`/reglages/primes/${json.datasetId}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Fichier des primes (CSV ou ZIP)
        <input name="file" type="file" accept=".csv,.zip,.txt,text/csv,application/zip" required className={`${inputClass} py-2.5`} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Année des primes
        <input name="year" type="number" inputMode="numeric" defaultValue={defaultYear} min={2000} max={2100} className={inputClass} />
        <span className="text-xs font-normal text-muted">Utilisée seulement si le fichier ne contient pas l&apos;année.</span>
      </label>
      <Button type="submit" disabled={busy} aria-busy={busy}>
        {busy ? "Analyse du fichier…" : "Importer et vérifier"}
      </Button>
      {error && (
        <p role="alert" className="rounded-xl bg-up-soft px-3 py-2 text-sm font-medium text-up">
          {error}
        </p>
      )}
    </form>
  );
}

/** Lance la recherche opendata.swiss sans attendre la tâche quotidienne. */
export function FetchNowButton({ year }: { year: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/datasets/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year }),
    })
      .then((r) => r.json() as Promise<{ status: string; message: string; datasetId?: number }>)
      .catch(() => ({ status: "error", message: "Le serveur ne répond pas.", datasetId: undefined }));
    setBusy(false);
    if (res.datasetId) router.push(`/reglages/primes/${res.datasetId}`);
    else setMessage(res.message);
  }
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? "Recherche en cours…" : `Chercher les primes ${year} maintenant`}
      </Button>
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
