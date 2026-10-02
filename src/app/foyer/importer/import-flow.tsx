"use client";

import { CheckCircle2, FileUp, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { analyzePolicyAction, applyPolicyImportAction } from "@/app/actions/household";
import type { ImportedPerson, PolicyImport } from "@/application/policy-import";
import { MODEL_LABEL, MODEL_TYPES, displayTariffLabel, type ModelType } from "@/domain/lamal";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Checkbox, Field, FormError, Input, Select } from "@/ui/form";

type Row = ImportedPerson & { include: boolean; premium: string; lcaKeep: boolean[] };

const toChf = (rp: number | null) => (rp === null ? "" : (rp / 100).toFixed(2));
const toRp = (s: string) => {
  const n = Number(s.replace(/[\s'’]/g, "").replace(",", "."));
  return s.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

export function ImportFlow({ insurers, years, hasPersons }: { insurers: { id: number; name: string }[]; years: number[]; hasPersons: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [result, setResult] = useState<PolicyImport | null>(null);
  const [insurerId, setInsurerId] = useState<string>("");
  const [year, setYear] = useState<number>(years[1] ?? years[0]!);
  const [rows, setRows] = useState<Row[]>([]);

  if (!hasPersons) {
    return (
      <Alert tone="info" title="Ajoutez d'abord les membres du foyer">
        Leur date de naissance permet de les retrouver dans la police. <Link href="/foyer/personne/nouvelle" className="text-primary underline">Ajouter une personne</Link>
      </Alert>
    );
  }

  function analyze(form: FormData) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await analyzePolicyAction(form);
      if (res.error || !res.result) {
        setError(res.error ?? "Lecture impossible.");
        setResult(null);
        return;
      }
      setResult(res.result);
      setInsurerId(res.result.insurerId ? String(res.result.insurerId) : "");
      setYear(res.result.year);
      setRows(res.result.persons.map((p) => ({ ...p, include: true, premium: toChf(p.billedMonthlyRp), lcaKeep: p.lca.map(() => true) })));
    });
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const included = rows.filter((r) => r.include);
  const invalid = included.some((r) => r.franchiseChf === null || toRp(r.premium) === null) || !insurerId || included.length === 0;

  function save() {
    start(async () => {
      const res = await applyPolicyImportAction({
        insurerId: Number(insurerId),
        year,
        persons: included.map((r) => ({
          personId: r.personId,
          tariffCode: r.tariffCode,
          tariffLabel: r.tariffLabel,
          modelType: r.modelType,
          franchiseChf: r.franchiseChf!,
          accident: r.accident,
          billedMonthlyRp: toRp(r.premium)!,
          policyNumber: r.policyNumber,
          lca: r.lca.filter((_, k) => r.lcaKeep[k]).map((l) => ({ guarantee: l.guarantee, monthlyRp: l.monthlyRp })),
        })),
      });
      if (res.error) setError(res.error);
      else {
        setDone(res.ok ?? "Enregistré.");
        setResult(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <form action={analyze} className="space-y-3">
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-4 text-center text-sm hover:bg-surface-2">
            <FileUp aria-hidden className="size-6 text-primary" />
            <span className="font-medium">Choisir le PDF de la police</span>
            <input type="file" name="file" accept="application/pdf,.pdf" required className="max-w-full text-sm" aria-label="PDF de la police" />
          </label>
          <Button type="submit" block disabled={pending}>
            {pending && !result ? "Lecture…" : "Lire la police"}
          </Button>
        </form>
        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" /> Lecture locale, sans service externe. Les documents scannés (photos) ne sont pas lisibles : utilisez le PDF reçu de la caisse.
        </p>
        <FormError message={error} />
        {done && (
          <Alert tone="success" title={done}>
            <Link href="/foyer" className="text-primary underline">Retour au foyer</Link>
          </Alert>
        )}
      </Card>

      {result && (
        <>
          {result.warnings.length > 0 && (
            <Alert tone="info" title="À vérifier">
              <ul className="list-disc pl-4">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          )}
          <Card className="grid grid-cols-2 gap-3">
            <Field label="Caisse" htmlFor="imp-insurer">
              <Select id="imp-insurer" value={insurerId} onChange={(e) => setInsurerId(e.target.value)}>
                <option value="">Choisir…</option>
                {insurers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Année du contrat" htmlFor="imp-year">
              <Select id="imp-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>

          {rows.map((r, i) => (
            <Card key={r.personId} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <Checkbox checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} label={<span className="font-semibold">{r.name}</span>} />
                {r.matched ? (
                  <Badge tone="saving">
                    <CheckCircle2 aria-hidden className="size-3.5" /> Tarif officiel retrouvé
                  </Badge>
                ) : (
                  <Badge tone="increase">À compléter</Badge>
                )}
              </div>
              {r.include && (
                <>
                  {r.tariffLabel && <p className="text-sm text-muted">{displayTariffLabel(r.tariffLabel, r.modelType)}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Modèle" htmlFor={`imp-model-${i}`}>
                      <Select id={`imp-model-${i}`} value={r.modelType} onChange={(e) => update(i, { modelType: e.target.value as ModelType })}>
                        {MODEL_TYPES.map((m) => (
                          <option key={m} value={m}>
                            {MODEL_LABEL[m]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Franchise (CHF)" htmlFor={`imp-fr-${i}`}>
                      <Input id={`imp-fr-${i}`} inputMode="numeric" value={r.franchiseChf ?? ""} onChange={(e) => update(i, { franchiseChf: e.target.value === "" ? null : Number(e.target.value) })} />
                    </Field>
                    <Field label="Prime mensuelle (CHF)" htmlFor={`imp-pr-${i}`}>
                      <Input id={`imp-pr-${i}`} inputMode="decimal" value={r.premium} onChange={(e) => update(i, { premium: e.target.value })} />
                    </Field>
                    <Field label="N° d'assuré" htmlFor={`imp-no-${i}`}>
                      <Input id={`imp-no-${i}`} value={r.policyNumber ?? ""} onChange={(e) => update(i, { policyNumber: e.target.value || null })} />
                    </Field>
                  </div>
                  <Checkbox checked={r.accident} onChange={(e) => update(i, { accident: e.target.checked })} label="Couverture accidents comprise" />
                  {r.lca.length > 0 && (
                    <div className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
                      <p className="font-medium">Complémentaires trouvées</p>
                      {r.lca.map((l, k) => (
                        <Checkbox
                          key={l.guarantee}
                          checked={r.lcaKeep[k]}
                          onChange={(e) => update(i, { lcaKeep: r.lcaKeep.map((v, x) => (x === k ? e.target.checked : v)) })}
                          label={`${l.label}${l.monthlyRp ? ` · CHF ${toChf(l.monthlyRp)}/mois` : ""}`}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          ))}

          <Button block size="lg" onClick={save} disabled={pending || invalid}>
            {pending ? "Enregistrement…" : `Enregistrer les contrats ${year}`}
          </Button>
          {invalid && <p className="text-center text-sm text-muted">Complétez la caisse, la franchise et la prime de chaque personne cochée.</p>}
        </>
      )}
    </div>
  );
}
