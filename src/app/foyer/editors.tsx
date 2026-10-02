"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/ui/button";
import { Sheet } from "@/ui/sheet";
import { LcaForm, type LcaDefaults, type LcaInsurerOption } from "./lca-form";
import { PolicyForm, type PolicyDefaults } from "./policy-form";

type Insurers = { id: number; name: string }[];

export function PolicySheet({ personId, insurers, years, policy, label }: { personId: number; insurers: Insurers; years: number[]; policy: PolicyDefaults; label: "add" | "edit" }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
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
      <PolicyForm personId={personId} insurers={insurers} years={years} policy={policy} onDone={() => setOpen(false)} />
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
