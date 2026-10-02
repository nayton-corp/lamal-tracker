"use client";

import { UserRound } from "lucide-react";
import { formatDateShort } from "@/domain/dates";
import { MODEL_LABEL, type ModelType } from "@/domain/lamal";
import { formatChf } from "@/domain/money";
import { Card } from "@/ui/card";
import { EditSheet } from "@/ui/edit-sheet";
import { PersonForm, type PersonDefaults } from "./person-form";

export function ProfileCard({ person, insurers, year, ageLabel }: { person: PersonDefaults & { id: number }; insurers: { id: number; name: string }[]; year: number; ageLabel: string }) {
  const models = person.allowedModels.length ? person.allowedModels.map((m) => MODEL_LABEL[m as ModelType]).join(", ") : "tous";
  return (
    <Card className="flex items-start gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <UserRound aria-hidden className="size-5" />
      </div>
      <dl className="min-w-0 flex-1 space-y-1 text-sm">
        <div>
          <dt className="sr-only">Naissance</dt>
          <dd className="text-base font-semibold">
            Né·e le {formatDateShort(person.birthDate)} <span className="font-normal text-muted">· {ageLabel}</span>
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">Frais de santé attendus :</dt>
          <dd>{formatChf(person.healthCostsRp, { whole: true })}/an</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">Modèles comparés :</dt>
          <dd>{models}</dd>
        </div>
        {person.doctorName && (
          <div className="flex gap-1">
            <dt className="text-muted">Médecin :</dt>
            <dd>{person.doctorName}</dd>
          </div>
        )}
      </dl>
      <EditSheet title={`${person.firstName} ${person.lastName}`} label="Modifier le profil">
        {(close) => <PersonForm person={person} insurers={insurers} year={year} onDone={close} />}
      </EditSheet>
    </Card>
  );
}
