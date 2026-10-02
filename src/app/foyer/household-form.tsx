"use client";

import { CheckCircle2, MapPin } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { postalCodeAction, saveHouseholdAction } from "@/app/actions/household";
import { CANTONS } from "@/domain/lamal";
import type { CommuneOption } from "@/infrastructure/regions/postal";
import { Field, FormError, Input, Select } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";
import { cn } from "@/ui/cn";

interface Household {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  commune?: string;
  bfsNumber?: number | null;
  canton: string;
  region: number;
}

/**
 * Foyer : le code postal suffit pour trouver la commune, le canton et la région de primes
 * (table officielle BAG + swisstopo). Si le code postal couvre plusieurs communes, on propose
 * la plus probable et on laisse choisir. Saisie manuelle possible en dernier recours.
 */
export function HouseholdForm({ household, onDone }: { household: Household | null; onDone?: () => void }) {
  const [state, action] = useActionState(saveHouseholdAction, null);
  const [npa, setNpa] = useState(household?.postalCode ?? "");
  const [city, setCity] = useState(household?.city ?? "");
  const [options, setOptions] = useState<CommuneOption[] | null>(null);
  const [bfs, setBfs] = useState<number | null>(household?.bfsNumber ?? null);
  const [manual, setManual] = useState(false);
  const [manualCanton, setManualCanton] = useState(household?.canton ?? "VD");
  const [manualRegion, setManualRegion] = useState(household?.region ?? 1);
  const [, startLookup] = useTransition();

  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  useEffect(() => {
    if (!/^\d{4}$/.test(npa)) return;
    startLookup(async () => {
      const found = await postalCodeAction(npa);
      setOptions(found);
      setBfs((current) => (current && found.some((o) => o.bfs === current) ? current : found[0]?.bfs ?? null));
      setCity((current) => current || found[0]?.localities[0] || "");
    });
  }, [npa]);

  const chosen = options?.find((o) => o.bfs === bfs) ?? null;
  const known = /^\d{4}$/.test(npa) && options !== null && options.length > 0;
  const useManual = manual || (options !== null && options.length === 0 && /^\d{4}$/.test(npa));
  const canton = useManual ? manualCanton : chosen?.canton ?? household?.canton ?? "";
  const region = useManual ? manualRegion : chosen?.region ?? household?.region ?? 0;
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="canton" value={canton} />
      <input type="hidden" name="region" value={region} />
      <input type="hidden" name="commune" value={useManual ? "" : chosen?.commune ?? household?.commune ?? ""} />
      <input type="hidden" name="bfsNumber" value={useManual ? "" : chosen?.bfs ?? ""} />

      <Field label="Nom du foyer" htmlFor="name" error={fe.name}>
        <Input id="name" name="name" required defaultValue={household?.name ?? ""} placeholder="Famille Dupont" autoComplete="family-name" />
      </Field>
      <Field label="Rue et numéro" htmlFor="street" hint="Expéditeur des lettres de résiliation.">
        <Input id="street" name="street" defaultValue={household?.street ?? ""} autoComplete="street-address" />
      </Field>
      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <Field label="Code postal (NPA)" htmlFor="postalCode" error={fe.canton || fe.region}>
          <Input id="postalCode" name="postalCode" inputMode="numeric" maxLength={4} required value={npa} onChange={(e) => setNpa(e.target.value.replace(/\D/g, ""))} autoComplete="postal-code" />
        </Field>
        <Field label="Localité" htmlFor="city">
          <Input id="city" name="city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
        </Field>
      </div>

      {known && !manual && options!.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Votre commune</legend>
          <p className="text-sm text-muted">Ce code postal couvre plusieurs communes ; la région de primes dépend de la commune.</p>
          {options!.map((o) => (
            <label key={o.bfs} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3", o.bfs === bfs ? "border-primary bg-primary-soft/50" : "border-border")}>
              <input type="radio" name="communePick" className="size-5 accent-[var(--primary)]" checked={o.bfs === bfs} onChange={() => setBfs(o.bfs)} />
              <span className="flex-1">
                <span className="block font-medium">{o.commune}</span>
                <span className="block text-sm text-muted">
                  {o.canton} · région {o.region}
                  {o.share < 100 ? ` · ${o.share} % des adresses` : ""}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {!useManual && chosen && (
        <p className="flex items-center gap-2 rounded-xl bg-saving-soft/60 p-3 text-sm">
          <CheckCircle2 aria-hidden className="size-5 shrink-0 text-saving" />
          <span>
            <strong>{chosen.commune}</strong> ({chosen.canton}) · région de primes <strong>{chosen.region}</strong>
          </span>
        </p>
      )}
      {!useManual && !chosen && household && !/^\d{4}$/.test(npa) && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <MapPin aria-hidden className="size-4" /> Canton {household.canton} · région {household.region}
        </p>
      )}

      {useManual ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {options !== null && options.length === 0 && /^\d{4}$/.test(npa) && <p className="text-sm text-muted">Code postal inconnu de la table officielle : indiquez le canton et la région (sur votre police).</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Canton" htmlFor="manualCanton">
              <Select id="manualCanton" value={manualCanton} onChange={(e) => setManualCanton(e.target.value)}>
                {CANTONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Région de primes" htmlFor="manualRegion">
              <Select id="manualRegion" value={manualRegion} onChange={(e) => setManualRegion(Number(e.target.value))}>
                {[0, 1, 2, 3].map((r) => (
                  <option key={r} value={r}>
                    Région {r}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      ) : (
        known && (
          <button type="button" className="min-h-11 text-sm text-primary underline-offset-2 hover:underline" onClick={() => setManual(true)}>
            Indiquer la région à la main
          </button>
        )
      )}

      <FormError message={state?.error} />
      <SubmitButton block disabled={!canton}>
        Enregistrer le foyer
      </SubmitButton>
    </form>
  );
}
