"use client";

import { CloudDownload, FileUp, History, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import type { ActionState } from "@/server/action";
import { checkPremiumsAction, importArchivesAction, uploadPremiumsAction } from "@/app/actions/data";
import type { ImportJob } from "@/server/jobs";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { FormError } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

export function ImportPanel({ initial }: { initial: ImportJob }) {
  const router = useRouter();
  const [job, setJob] = useState(initial);
  const [polling, setPolling] = useState(initial.running);
  const [checkMsg, setCheckMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [checking, startCheck] = useTransition();
  const [uploadState, upload] = useActionState(async (prev: ActionState, form: FormData) => {
    const res = await uploadPremiumsAction(prev, form);
    if (res?.ok) setPolling(true);
    return res;
  }, null);

  useEffect(() => {
    if (!polling) return;
    const t = setInterval(async () => {
      const next = (await (await fetch("/api/import", { cache: "no-store" })).json()) as ImportJob;
      setJob(next);
      if (!next.running) {
        setPolling(false);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [polling, router]);

  const outcome = job.outcome;
  return (
    <div className="space-y-4">
      <Button
        block
        disabled={checking || job.running}
        onClick={() =>
          startCheck(async () => {
            const res = await checkPremiumsAction();
            setCheckMsg(res);
            if (res?.ok) setPolling(true);
          })
        }
      >
        {checking ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <CloudDownload aria-hidden className="size-5" />}
        Télécharger les primes depuis l&apos;OFSP
      </Button>
      <Button
        block
        variant="secondary"
        disabled={checking || job.running}
        onClick={() =>
          startCheck(async () => {
            const res = await importArchivesAction();
            setCheckMsg(res);
            if (res?.ok) setPolling(true);
          })
        }
      >
        <History aria-hidden className="size-5" />
        Importer les années précédentes (archives)
      </Button>
      {checkMsg?.error && <FormError message={`Téléchargement impossible : ${checkMsg.error}. Vous pouvez importer le fichier à la main ci-dessous.`} />}

      <details className="rounded-xl border border-dashed border-border px-3">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
          <FileUp aria-hidden className="size-4" /> Importer un fichier à la main
        </summary>
      <form action={upload} className="space-y-2 pb-3">
        <label htmlFor="file" className="block text-sm text-muted">
          Fichier OFSP « Prämien_CH » (.xlsx, .csv) ou archive annuelle (.zip).
        </label>
        <input id="file" name="file" type="file" accept=".xlsx,.csv,.zip" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:font-medium file:text-primary" />
        <SubmitButton size="sm" variant="secondary" disabled={job.running} pendingLabel="Envoi…">
          Importer le fichier
        </SubmitButton>
        <FormError message={uploadState?.error} />
      </form>
      </details>

      {job.phase !== "idle" && (
        <div aria-live="polite" className="space-y-2">
          {job.running && (
            <div className="rounded-xl bg-primary-soft p-3 text-sm text-primary">
              <p className="flex items-center gap-2 font-medium">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                {job.phase === "download" ? "Téléchargement en cours…" : `Import : ${job.rowsRead.toLocaleString("fr-CH")} lignes lues`}
              </p>
              <p className="mt-1 opacity-80">{job.label}. Sur un Raspberry Pi, comptez une à quelques minutes.</p>
            </div>
          )}
          {job.log.length > 0 && (
            <Alert tone="info" title="Archives">
              <ul className="list-disc pl-4">
                {job.log.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Alert>
          )}
          {job.phase === "error" && <Alert tone="danger" title="L'import a échoué">{job.error}</Alert>}
          {outcome?.status === "IMPORTED" && (
            <Alert tone="success" title={`Primes ${outcome.report.year} importées`}>
              {outcome.report.stats.rowsKept.toLocaleString("fr-CH")} primes, {outcome.report.stats.insurers} caisses, {outcome.report.stats.cantons} cantons.
              {outcome.report.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {outcome.report.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          {outcome?.status === "ALREADY" && <Alert tone="info" title="Fichier déjà importé">Ce fichier (même empreinte) est déjà dans la base pour {outcome.year ?? "—"}.</Alert>}
          {outcome?.status === "FAILED" && (
            <Alert tone="danger" title="Fichier refusé">
              <ul className="list-disc pl-4">
                {outcome.report.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
