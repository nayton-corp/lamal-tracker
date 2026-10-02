"use client";

import { Loader2, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { MODEL_LABEL, MODEL_TYPES, type ModelType } from "@/domain/lamal";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Sheet } from "@/ui/sheet";

/**
 * Filtres du comparateur. Sans paramètre d'URL, ce sont les besoins de la personne qui
 * s'appliquent (`activeFranchise`, `activeModels`) ; « all » lève un filtre explicitement.
 */
export function FilterBar({ franchises, activeFranchise, activeModels, sort, strategyLabel }: {
  franchises: number[];
  activeFranchise: number | null;
  activeModels: ModelType[];
  sort: string;
  strategyLabel: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const models = activeModels;
  const franchise = activeFranchise === null ? "" : String(activeFranchise);
  const all = params.get("all") === "1";
  const every = params.get("every") === "1";

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

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

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Trier par" className={cn("grid rounded-xl bg-surface-2 p-1", strategyLabel ? "grid-cols-3" : "grid-cols-2")}>
        {(
          [
            ...(strategyLabel ? [["strategy", strategyLabel]] : []),
            ["total", "Coût réel"],
            ["premium", "Prime seule"],
          ] as [string, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="radio"
            aria-checked={sort === key}
            onClick={() => update({ sort: key })}
            className={cn("min-h-11 cursor-pointer rounded-lg text-sm font-medium transition-colors", sort === key ? "bg-surface text-foreground shadow-card" : "text-muted")}
          >
            {label}
          </button>
        ))}
      </div>
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
          <label className="mt-4 flex min-h-11 items-center gap-3">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={all} onChange={(e) => update({ all: e.target.checked ? "1" : null })} />
            Ignorer les préférences et exclusions de la personne
          </label>
        </Sheet>
        {pending && <Loader2 aria-label="Mise à jour" className="size-5 animate-spin text-muted" />}
      </div>
    </div>
  );
}
