"use client";

import { Home, UserRound } from "lucide-react";
import { Card } from "@/ui/card";
import { EditSheet } from "@/ui/edit-sheet";
import { HouseholdForm, type SoloIdentity } from "./household-form";

interface Household {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  canton: string;
  region: number;
}

/** Foyer (ou personne seule) déjà configuré : résumé, modification dans un panneau. */
export function HouseholdCard({ household, person }: { household: Household; person?: SoloIdentity | null }) {
  const solo = person !== undefined;
  return (
    <Card className="flex items-start gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        {solo ? <UserRound aria-hidden className="size-5" /> : <Home aria-hidden className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{household.name}</p>
        <p className="text-sm text-muted">
          {[household.street, `${household.postalCode} ${household.city}`.trim()].filter(Boolean).join(", ") || "Adresse à compléter"}
        </p>
        <p className="mt-1 text-sm">
          Canton {household.canton} · région de primes {household.region}
        </p>
      </div>
      <EditSheet title={solo ? "Vous" : "Foyer"} label={solo ? "Modifier mes coordonnées" : "Modifier le foyer"} description="Adresse d'expédition des lettres et région de primes.">
        {(close) => <HouseholdForm household={household} person={person} onDone={close} />}
      </EditSheet>
    </Card>
  );
}
