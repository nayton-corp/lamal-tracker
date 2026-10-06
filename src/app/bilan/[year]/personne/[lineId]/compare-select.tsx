"use client";

import { Columns3 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/ui/button";

const MAX = 4;

function useSelection() {
  const params = useSearchParams();
  const selected = (params.get("c") ?? "").split(",").filter(Boolean);
  return { params, selected };
}

/** Case « Comparer » d'une offre : la sélection vit dans l'URL (partageable, survit au retour). */
export function CompareToggle({ k, name }: { k: string; name: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { params, selected } = useSelection();
  const checked = selected.includes(k);
  const full = !checked && selected.length >= MAX;
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-5 accent-[var(--primary)]"
        checked={checked}
        disabled={full}
        aria-label={`Comparer ${name}`}
        onChange={() => {
          const next = new URLSearchParams(params);
          const list = checked ? selected.filter((x) => x !== k) : [...selected, k];
          if (list.length) next.set("c", list.join(","));
          else next.delete("c");
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
      />
      {full ? `Comparer (${MAX} au plus)` : "Comparer côte à côte"}
    </label>
  );
}

export function CompareBar() {
  const pathname = usePathname();
  const { selected } = useSelection();
  if (selected.length === 0) return null;
  return (
    <div className="sticky bottom-20 z-30 lg:bottom-6">
      <Button asChild block size="lg" variant={selected.length >= 2 ? "primary" : "secondary"} className="shadow-lg">
        <Link href={selected.length >= 2 ? `${pathname}/comparer?c=${selected.join(",")}` : "#"} aria-disabled={selected.length < 2}>
          <Columns3 aria-hidden className="size-5" />
          {selected.length >= 2 ? `Comparer ${selected.length} offres côte à côte` : "Cochez une deuxième offre à comparer"}
        </Link>
      </Button>
    </div>
  );
}
