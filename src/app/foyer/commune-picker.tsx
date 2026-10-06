"use client";

import { CheckCircle2, MapPin } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { postalCodeAction } from "@/app/actions/household";
import { CANTONS } from "@/domain/lamal";
import type { CommuneOption } from "@/infrastructure/regions/postal";
import { Field, Input, Select } from "@/ui/form";
import { cn } from "@/ui/cn";

export interface PlaceDefaults {
  postalCode: string;
  city?: string;
  commune?: string;
  bfsNumber?: number | null;
  canton: string;
  region: number;
}

/**
 * Commune et région de primes à partir du code postal (table officielle BAG + swisstopo). Si le
 * code postal couvre plusieurs communes, on propose la plus probable et on laisse choisir ; saisie
 * manuelle du canton et de la région en dernier recours. Envoie `canton`, `region`, `commune`,
 * `bfsNumber` et `postalCode` (plus `city` avec `withCity`).
 */
export function CommunePicker({ place, withCity, error, onPlace }: {
  place: PlaceDefaults | null;
  withCity?: boolean;
  error?: string;
  /** Appelé quand le canton ou la région change (pour recharger les primes). */
  onPlace?: (p: { canton: string; region: number }) => void;
}) {
  const [npa, setNpa] = useState(place?.postalCode ?? "");
  const [city, setCity] = useState(place?.city ?? "");
  const [options, setOptions] = useState<CommuneOption[] | null>(null);
  const [bfs, setBfs] = useState<number | null>(place?.bfsNumber ?? null);
  const [manual, setManual] = useState(false);
  const [manualCanton, setManualCanton] = useState(place?.canton || "VD");
  const [manualRegion, setManualRegion] = useState(place?.region ?? 1);
  const [, startLookup] = useTransition();

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
  const canton = useManual ? manualCanton : chosen?.canton ?? place?.canton ?? "";
  const region = useManual ? manualRegion : chosen?.region ?? place?.region ?? 0;

  useEffect(() => {
    if (canton) onPlace?.({ canton, region });
  }, [canton, region, onPlace]);

  const npaField = (
    <Field label="Code postal (NPA)" htmlFor="postalCode" error={error}>
      <Input id="postalCode" name="postalCode" inputMode="numeric" maxLength={4} required value={npa} onChange={(e) => setNpa(e.target.value.replace(/\D/g, ""))} autoComplete="postal-code" />
    </Field>
  );

  return (
    <div className="space-y-4">
      <input type="hidden" name="canton" value={canton} />
      <input type="hidden" name="region" value={region} />
      <input type="hidden" name="commune" value={useManual ? "" : chosen?.commune ?? place?.commune ?? ""} />
      <input type="hidden" name="bfsNumber" value={useManual ? "" : chosen?.bfs ?? place?.bfsNumber ?? ""} />

      {withCity ? (
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          {npaField}
          <Field label="Localité" htmlFor="city">
            <Input id="city" name="city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </Field>
        </div>
      ) : (
        <div className="max-w-40">{npaField}</div>
      )}

      {known && !manual && options!.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Commune</legend>
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
      {!useManual && !chosen && place?.canton && !/^\d{4}$/.test(npa) && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <MapPin aria-hidden className="size-4" /> {place.commune ? `${place.commune} (${place.canton})` : `Canton ${place.canton}`} · région {place.region}
        </p>
      )}

      {useManual ? (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {options !== null && options.length === 0 && /^\d{4}$/.test(npa) && <p className="text-sm text-muted">Code postal inconnu de la table officielle : indiquez le canton et la région (sur la police).</p>}
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
    </div>
  );
}
