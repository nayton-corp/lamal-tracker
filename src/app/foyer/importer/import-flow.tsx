"use client";

import { CheckCircle2, FileUp, Loader2, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { analyzePolicyAction, applyPolicyImportAction } from "@/app/actions/household";
import type { ImportedPerson, PolicyImport } from "@/application/policy-import";
import { domicileLabel } from "@/domain/domicile";
import { MODEL_LABEL, MODEL_TYPES, displayTariffLabel, type ModelType } from "@/domain/lamal";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Checkbox, Field, FormError, Input, Select } from "@/ui/form";
import { rpToInput } from "@/domain/money";

type Row = ImportedPerson & { include: boolean; premium: string; lcaKeep: boolean[] };

const toRp = (s: string) => {
  const n = Number(s.replace(/[\s'’]/g, "").replace(",", "."));
  return s.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};

/**
 * Import d'une police PDF : le texte est lu sur le serveur, les contrats proposés sont
 * vérifiés puis enregistrés. `initial` : analyse déjà faite (accueil depuis la police).
 */
export function ImportFlow({ insurers, years, hasPersons, initial, onSaved, focus, backHref = "/foyer" }: {
  insurers: { id: number; name: string }[];
  years: number[];
  hasPersons: boolean;
  initial?: PolicyImport | null;
  /** Appelé après l'enregistrement (accueil guidé) ; sinon un lien ramène à `backHref`. */
  onSaved?: () => void;
  /**
   * Import lancé depuis la fiche d'une personne : elle seule est cochée d'office ; les autres
   * personnes d'une police familiale sont proposées, décochées.
   */
  focus?: { personId: number; firstName: string };
  backHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [result, setResult] = useState<PolicyImport | null>(null);
  const [insurerId, setInsurerId] = useState<string>("");
  const [year, setYear] = useState<number>(years[1] ?? years[0]!);
  const [rows, setRows] = useState<Row[]>([]);
  const [started, setStarted] = useState(false);
  if (initial && !started) {
    setStarted(true);
    show({ result: initial });
  }

  if (!hasPersons) {
    return (
      <Alert tone="info" title="Ajoutez d'abord la personne">
        Sa date de naissance permet de la retrouver dans la police. <Link href="/foyer/personne/nouvelle" className="text-primary underline">Ajouter une personne</Link>
      </Alert>
    );
  }

  function show(res: { result?: PolicyImport; error?: string }) {
    if (res.error || !res.result) {
      setError(res.error ?? "Lecture impossible.");
      setResult(null);
      return;
    }
    setResult(res.result);
    setInsurerId(res.result.insurerId ? String(res.result.insurerId) : "");
    setYear(res.result.year);
    const persons = focus ? [...res.result.persons].sort((a, b) => Number(b.personId === focus.personId) - Number(a.personId === focus.personId)) : res.result.persons;
    setRows(persons.map((p) => ({ ...p, include: !focus || p.personId === focus.personId, premium: rpToInput(p.billedMonthlyRp), lcaKeep: p.lca.map(() => true) })));
  }

  function analyze(file: File | undefined) {
    if (!file) return;
    setError(null);
    setDone(null);
    start(async () => {
      const form = new FormData();
      form.set("file", file);
      show(await analyzePolicyAction(form));
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
        domicile: result?.domicile,
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
        onSaved?.();
      }
    });
  }

  return (
    <div className="space-y-4">
      {!result && (
        <Card className="space-y-3">
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/30 p-4 text-center text-sm hover:bg-primary-soft/60">
            <FileUp aria-hidden className="size-7 text-primary" />
            <span className="font-semibold">Choisir le PDF de la police</span>
            <span className="text-xs text-muted">Reçu par e-mail ou téléchargé sur le portail de la caisse</span>
            <input type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="PDF de la police" disabled={pending} onChange={(e) => { analyze(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {pending && (
            <p className="flex items-center gap-2 text-sm" role="status">
              <Loader2 aria-hidden className="size-4 animate-spin text-primary" /> Lecture de la police…
            </p>
          )}
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" /> Lu par l&apos;app sans intermédiaire ; le PDF n&apos;est pas gardé, seules les valeurs retenues le sont.
          </p>
          <FormError message={error} />
          {done && (
            <Alert tone="success" title={done}>
              {!onSaved && <Link href={backHref} className="text-primary underline">{focus ? `Retour à ${focus.firstName}` : "Retour au foyer"}</Link>}
            </Alert>
          )}
        </Card>
      )}

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
          {focus && !rows.some((r) => r.personId === focus.personId) && (
            <Alert tone="info" title={`${focus.firstName} n'apparaît pas dans cette police`}>
              La personne est retrouvée par sa date de naissance : vérifiez celle de la fiche, ou saisissez le contrat à la main.
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
            <p className="col-span-2 flex items-center gap-1.5 text-sm text-muted">
              <MapPin aria-hidden className="size-4 shrink-0" /> Domicile au 1er janvier : {domicileLabel(result.domicile)}
            </p>
          </Card>

          {rows.map((r, i) => (
            <Card key={r.personId} className="space-y-3">
              {focus && r.personId !== focus.personId && rows.findIndex((x) => x.personId !== focus.personId) === i && (
                <p className="text-sm font-medium text-muted">Aussi dans cette police</p>
              )}
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
                          label={`${l.label}${l.monthlyRp ? ` · CHF ${rpToInput(l.monthlyRp)}/mois` : ""}`}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </Card>
          ))}

          <FormError message={error} />
          <Button block size="lg" onClick={save} disabled={pending || invalid}>
            {pending ? "Enregistrement…" : `Enregistrer ${included.length > 1 ? "les contrats" : "le contrat"} ${year}`}
          </Button>
          {invalid && <p className="text-center text-sm text-muted">Complétez la caisse, la franchise et la prime de chaque personne cochée.</p>}
          <button type="button" className="min-h-11 w-full text-sm text-primary underline-offset-2 hover:underline" onClick={() => { setResult(null); setError(null); }}>
            Choisir un autre fichier
          </button>
        </>
      )}
    </div>
  );
}
