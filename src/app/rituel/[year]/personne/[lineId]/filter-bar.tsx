"use client";

import { ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { MODEL_LABEL, MODEL_TYPES, type ModelType } from "@/domain/lamal";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Sheet } from "@/ui/sheet";

function useUrlUpdate() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }
  return { params, pending, update };
}

/**
 * En haut de la liste : les offres selon les préférences de la personne (par défaut), ou toutes
 * les offres sans filtre. Changer de position remet les filtres à zéro.
 */
export function ScopeToggle({ allOffers }: { allOffers: boolean }) {
  const { pending, update } = useUrlUpdate();
  const options: [boolean, string][] = [
    [false, "Selon mes préférences"],
    [true, "Toutes les offres"],
  ];
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label="Offres affichées" className="grid flex-1 grid-cols-2 rounded-xl bg-surface-2 p-1">
        {options.map(([value, label]) => (
          <button
            key={label}
            role="radio"
            aria-checked={allOffers === value}
            onClick={() => update({ all: value ? "1" : null, m: null, f: null, n: null })}
            className={cn("min-h-11 cursor-pointer rounded-lg px-2 text-sm font-medium transition-colors", allOffers === value ? "bg-surface text-foreground shadow-card" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>
      {pending && <Loader2 aria-label="Mise à jour" className="size-5 shrink-0 animate-spin text-muted" />}
    </div>
  );
}

/**
 * Filtres du comparateur, repliés par défaut. Sans paramètre d'URL, ce sont les préférences de la
 * personne qui s'appliquent (`activeFranchise`, `activeModels`) ; « all » lève un filtre explicitement.
 */
export function FilterBar({ franchises, activeFranchise, activeModels }: {
  franchises: number[];
  activeFranchise: number | null;
  activeModels: ModelType[];
}) {
  const { params, pending, update } = useUrlUpdate();
  const models = activeModels;
  const franchise = activeFranchise === null ? "" : String(activeFranchise);
  const every = params.get("every") === "1";

  const toggleModel = (m: ModelType) => {
    const set = new Set(models);
    if (set.has(m)) set.delete(m);
    else set.add(m);
    update({ m: [...set].join(",") || "all" });
  };

  const chip = (active: boolean) =>
    cn(
      "min-h-11 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors",
      active ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-foreground hover:bg-surface-2",
    );

  const count = (franchise ? 1 : 0) + (models.length ? 1 : 0) + (every ? 1 : 0);
  return (
    <details className="group rounded-2xl border border-border bg-surface p-3 shadow-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal aria-hidden className="size-4 text-muted" />
        <span className="flex-1">Filtres{count ? ` (${count})` : ""}</span>
        {pending && <Loader2 aria-label="Mise à jour" className="size-5 animate-spin text-muted" />}
        <ChevronDown aria-hidden className="size-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible">
        <button className={chip(franchise === "")} onClick={() => update({ f: "all" })} aria-pressed={franchise === ""}>
          Toutes franchises
        </button>
        {franchises.map((f) => (
          <button key={f} className={chip(franchise === String(f))} onClick={() => update({ f: franchise === String(f) ? "all" : String(f) })} aria-pressed={franchise === String(f)}>
            F {f}
          </button>
        ))}
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={!every} onChange={(e) => update({ every: e.target.checked ? null : "1" })} />
        Une seule offre par caisse (la meilleure)
      </label>
      <div className="flex items-center gap-2">
        <Sheet
          title="Modèles d'assurance"
          description="Médecin de famille, télémédecine… Aucun choix = tous les modèles."
          trigger={
            <Button variant="secondary" size="sm">
              <SlidersHorizontal aria-hidden className="size-4" /> Modèles d&apos;assurance{models.length ? ` (${models.length})` : ""}
            </Button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {MODEL_TYPES.map((m) => (
              <button key={m} className={chip(models.includes(m))} onClick={() => toggleModel(m)} aria-pressed={models.includes(m)}>
                {MODEL_LABEL[m]}
              </button>
            ))}
          </div>
        </Sheet>
      </div>
      </div>
    </details>
  );
}
