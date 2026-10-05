"use client";

import { FileUp, Keyboard, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Sheet } from "@/ui/sheet";
import { LcaForm, type LcaDefaults, type LcaInsurerOption } from "./lca-form";
import { PolicyForm, type PolicyDefaults } from "./policy-form";

type Insurers = { id: number; name: string }[];

/**
 * Ajouter ou modifier un contrat LAMal. Pour un ajout, on choisit d'abord : importer le PDF de la
 * police (tout est pré-rempli) ou saisir à la main.
 */
export function PolicySheet({ personId, insurers, years, policy, label }: { personId: number; insurers: Insurers; years: number[]; policy: PolicyDefaults; label: "add" | "edit" }) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(label === "edit");
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setManual(label === "edit");
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={label === "add" ? "Nouveau contrat LAMal" : `Contrat LAMal ${policy.coverageYear}`}
      trigger={
        label === "add" ? (
          <Button size="sm" variant="ghost" aria-label="Ajouter un contrat LAMal">
            <Plus aria-hidden className="size-4" /> Contrat
          </Button>
        ) : (
          <Button size="icon" variant="ghost" aria-label={`Modifier le contrat ${policy.coverageYear}`}>
            <Pencil aria-hidden className="size-4" />
          </Button>
        )
      }
    >
      {manual ? (
        <PolicyForm personId={personId} insurers={insurers} years={years} policy={policy} onDone={() => onOpenChange(false)} />
      ) : (
        <div className="space-y-3">
          <Link
            href={`/foyer/importer?personne=${personId}`}
            className="flex min-h-16 items-center gap-3 rounded-xl border border-primary/40 bg-primary-soft/30 p-3 hover:bg-primary-soft/60"
          >
            <FileUp aria-hidden className="size-6 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold">Importer le PDF de la police</span>
              <span className="block text-sm text-muted">Tout est rempli, vous vérifiez.</span>
            </span>
          </Link>
          <button type="button" onClick={() => setManual(true)} className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-surface-2">
            <Keyboard aria-hidden className="size-6 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold">Saisir à la main</span>
              <span className="block text-sm text-muted">Caisse et franchise : la prime est retrouvée toute seule.</span>
            </span>
          </button>
        </div>
      )}
    </Sheet>
  );
}

export function LcaSheet({ personId, insurers, lca, lamalInsurerId }: { personId: number; insurers: LcaInsurerOption[]; lca: LcaDefaults | null; lamalInsurerId: number | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={lca ? lca.productName : "Nouvelle complémentaire LCA"}
      description="Assurance complémentaire privée : jamais résiliée par le changement de LAMal."
      trigger={
        lca ? (
          <Button size="icon" variant="ghost" aria-label={`Modifier ${lca.productName}`}>
            <Pencil aria-hidden className="size-4" />
          </Button>
        ) : (
          <Button size="sm" variant="ghost" aria-label="Ajouter une complémentaire LCA">
            <Plus aria-hidden className="size-4" /> LCA
          </Button>
        )
      }
    >
      <LcaForm personId={personId} insurers={insurers} lca={lca} lamalInsurerId={lamalInsurerId} onDone={() => setOpen(false)} />
    </Sheet>
  );
}
