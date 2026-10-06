"use client";

import { useActionState } from "react";
import { setDomicileAction } from "@/app/actions/review";
import { CommunePicker, type PlaceDefaults } from "@/app/foyer/commune-picker";
import { Alert } from "@/ui/alert";
import { Card } from "@/ui/card";
import { Checkbox, FormError } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

export interface DomicilePerson {
  personId: number;
  firstName: string;
  /** Domicile actuellement retenu (« Fribourg (FR) »). */
  domicile: string;
  decided: boolean;
}

/** Nouvelle commune, puis les personnes concernées (tout le foyer d'office). */
export function DomicileForm({ year, reviewId, place, persons }: { year: number; reviewId: number; place: PlaceDefaults; persons: DomicilePerson[] }) {
  const [state, action] = useActionState(setDomicileAction, null);
  const anyDecided = persons.some((p) => p.decided);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="reviewId" value={reviewId} />
      <Card className="space-y-4">
        <CommunePicker place={place} />
      </Card>
      {persons.length > 1 && (
        <Card>
          <fieldset>
            <legend className="mb-1 font-medium">Qui habitera à cette adresse ?</legend>
            {persons.map((p) => (
              <Checkbox
                key={p.personId}
                name="personId"
                value={p.personId}
                defaultChecked
                label={
                  <span>
                    {p.firstName} <span className="text-sm text-muted">· aujourd&apos;hui {p.domicile}</span>
                  </span>
                }
              />
            ))}
          </fieldset>
        </Card>
      )}
      {persons.length === 1 && <input type="hidden" name="personId" value={persons[0]!.personId} />}
      {anyDecided && (
        <Alert tone="info" title="Choix à refaire">
          Les offres changent avec la commune : le choix déjà fait pour les personnes concernées est remis à zéro.
        </Alert>
      )}
      <FormError message={state?.error} />
      <SubmitButton block>Enregistrer le domicile</SubmitButton>
    </form>
  );
}
