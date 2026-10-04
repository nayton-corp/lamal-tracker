"use client";

import { CheckCircle2, FileUp, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { analyzePolicyStartAction, createFromPolicyAction, postalCodeAction } from "@/app/actions/household";
import { ImportFlow } from "@/app/foyer/importer/import-flow";
import type { PolicyHolderPreview, PolicyImport } from "@/application/policy-import";
import type { CommuneOption } from "@/infrastructure/regions/postal";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Field, FormError, Input } from "@/ui/form";

type Person = { firstName: string; lastName: string; birthDate: string };

/**
 * Accueil depuis la police : le PDF donne les personnes et l'adresse (à vérifier), le foyer est
 * créé d'un coup, puis les contrats lus dans la même police sont proposés.
 */
export function PolicyStart({ insurers, years, solo }: { insurers: { id: number; name: string }[]; years: number[]; solo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PolicyHolderPreview | null>(null);
  const [text, setText] = useState("");
  const [contracts, setContracts] = useState<PolicyImport | null>(null);

  const [persons, setPersons] = useState<Person[]>([]);
  const [street, setStreet] = useState("");
  const [npa, setNpa] = useState("");
  const [city, setCity] = useState("");
  const [options, setOptions] = useState<CommuneOption[]>([]);
  const [bfs, setBfs] = useState<number | null>(null);

  useEffect(() => {
    if (!/^\d{4}$/.test(npa)) return;
    let alive = true;
    postalCodeAction(npa).then((found) => {
      if (!alive) return;
      setOptions(found);
      setBfs((b) => (b && found.some((o) => o.bfs === b) ? b : found[0]?.bfs ?? null));
      setCity((c) => c || found[0]?.localities[0] || "");
    });
    return () => {
      alive = false;
    };
  }, [npa]);

  function analyze(file: File | undefined) {
    if (!file) return;
    setError(null);
    start(async () => {
      const form = new FormData();
      form.set("file", file);
      const res = await analyzePolicyStartAction(form);
      if (res.error || !res.preview) return setError(res.error ?? "Lecture impossible.");
      setPreview(res.preview);
      setText(res.text ?? "");
      setPersons(res.preview.persons.length ? res.preview.persons : [{ firstName: "", lastName: "", birthDate: "" }]);
      setStreet(res.preview.address?.street ?? "");
      setNpa(res.preview.address?.postalCode ?? "");
      setCity(res.preview.address?.city ?? "");
      setOptions(res.preview.communes);
      setBfs(res.preview.communes[0]?.bfs ?? null);
    });
  }

  const chosen = options.find((o) => o.bfs === bfs) ?? null;
  const kept = solo ? persons.slice(0, 1) : persons;
  const valid = chosen !== null && kept.length > 0 && kept.every((p) => p.firstName.trim() && p.lastName.trim() && /^\d{4}-\d{2}-\d{2}$/.test(p.birthDate));
  const setPerson = (i: number, patch: Partial<Person>) => setPersons((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  function confirm() {
    if (!chosen) return;
    setError(null);
    start(async () => {
      const res = await createFromPolicyAction(
        {
          address: { street, postalCode: npa, city, bfsNumber: chosen.bfs, canton: chosen.canton, region: chosen.region, commune: chosen.commune },
          persons: kept,
        },
        text,
      );
      if (res.error || !res.result) return setError(res.error ?? "Enregistrement impossible.");
      setContracts(res.result);
    });
  }

  if (contracts) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-saving">
          <CheckCircle2 aria-hidden className="size-4" /> {solo ? "Profil créé" : `${kept.length} personne(s) et l'adresse enregistrées`}. Reste à vérifier {solo ? "votre contrat" : "les contrats"}.
        </p>
        <ImportFlow hasPersons insurers={insurers} years={years} initial={contracts} onSaved={() => router.push("/bienvenue?etape=contrats")} />
      </div>
    );
  }

  if (!preview) {
    return (
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
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Alert tone="info" title={preview.insurerName ? `Police ${preview.insurerName} ${preview.year}` : `Police ${preview.year}`}>
        Vérifiez ce qui a été lu, puis confirmez.
      </Alert>

      <Card className="space-y-3">
        <p className="font-medium">{solo ? "Vous" : "Personnes assurées"}</p>
        {kept.map((p, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label={`Prénom ${i + 1}`} placeholder="Prénom" value={p.firstName} onChange={(e) => setPerson(i, { firstName: e.target.value })} autoComplete="off" />
              <Input aria-label={`Nom ${i + 1}`} placeholder="Nom" value={p.lastName} onChange={(e) => setPerson(i, { lastName: e.target.value })} autoComplete="off" />
            </div>
            <div className="flex gap-2">
              <Input aria-label={`Date de naissance ${i + 1}`} type="date" value={p.birthDate} onChange={(e) => setPerson(i, { birthDate: e.target.value })} />
              {!solo && kept.length > 1 && (
                <Button type="button" variant="ghost" size="icon" aria-label="Retirer cette personne" onClick={() => setPersons((ps) => ps.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {!solo && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setPersons((ps) => [...ps, { firstName: "", lastName: ps[0]?.lastName ?? "", birthDate: "" }])}>
            <Plus aria-hidden className="size-4" /> Ajouter une personne
          </Button>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="font-medium">Adresse</p>
        <Field label="Rue et numéro" htmlFor="ps-street">
          <Input id="ps-street" value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" />
        </Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="Code postal (NPA)" htmlFor="ps-npa">
            <Input id="ps-npa" inputMode="numeric" maxLength={4} value={npa} onChange={(e) => setNpa(e.target.value.replace(/\D/g, ""))} autoComplete="postal-code" />
          </Field>
          <Field label="Localité" htmlFor="ps-city">
            <Input id="ps-city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </Field>
        </div>
        {options.length > 1 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Votre commune (la région de primes en dépend)</legend>
            {options.map((o) => (
              <label key={o.bfs} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3", o.bfs === bfs ? "border-primary bg-primary-soft/50" : "border-border")}>
                <input type="radio" name="ps-commune" className="size-5 accent-[var(--primary)]" checked={o.bfs === bfs} onChange={() => setBfs(o.bfs)} />
                <span className="flex-1">
                  <span className="block font-medium">{o.commune}</span>
                  <span className="block text-sm text-muted">{o.canton} · région {o.region}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {chosen ? (
          <p className="flex items-center gap-2 rounded-xl bg-saving-soft/60 p-3 text-sm">
            <CheckCircle2 aria-hidden className="size-5 shrink-0 text-saving" />
            <span>
              <strong>{chosen.commune}</strong> ({chosen.canton}) · région de primes <strong>{chosen.region}</strong>
            </span>
          </p>
        ) : (
          /^\d{4}$/.test(npa) && options.length === 0 && <p className="text-sm text-increase">Code postal inconnu : vérifiez-le.</p>
        )}
      </Card>

      <FormError message={error} />
      <Button block size="lg" disabled={!valid || pending} onClick={confirm}>
        {pending ? "Enregistrement…" : "Confirmer et lire les contrats"}
      </Button>
      <button type="button" className="min-h-11 w-full text-sm text-primary underline-offset-2 hover:underline" onClick={() => { setPreview(null); setError(null); }}>
        Choisir un autre fichier
      </button>
    </div>
  );
}
