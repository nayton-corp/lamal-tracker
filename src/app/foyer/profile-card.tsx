"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { formatDateShort } from "@/domain/dates";
import { MODEL_LABEL, type ModelType } from "@/domain/lamal";
import { formatChf } from "@/domain/money";
import { Card } from "@/ui/card";
import { EditSheet } from "@/ui/edit-sheet";
import { PersonForm, type PersonDefaults } from "./person-form";

export interface ProfileNeeds {
  healthCostsRp: number;
  allowedModels: string[];
  doctorName: string | null;
}

/** Identité (modifiable ici) et besoins (réglés au questionnaire du bilan, en lecture seule). */
export function ProfileCard({ person, needs, needsHref, year, ageLabel }: { person: PersonDefaults & { id: number }; needs: ProfileNeeds; needsHref: string | null; year: number; ageLabel: string }) {
  const models = needs.allowedModels.length ? needs.allowedModels.map((m) => MODEL_LABEL[m as ModelType]).join(", ") : "tous";
  return (
    <Card className="flex items-start gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <UserRound aria-hidden className="size-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <dl className="space-y-1">
          <div>
            <dt className="sr-only">Naissance</dt>
            <dd className="text-base font-semibold">
              Né·e le {formatDateShort(person.birthDate)} <span className="font-normal text-muted">· {ageLabel}</span>
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-1">
            <dt className="text-muted">Frais de santé :</dt>
            <dd>{formatChf(needs.healthCostsRp, { whole: true })}/an</dd>
          </div>
          <div className="flex flex-wrap gap-x-1">
            <dt className="text-muted">Modèles comparés :</dt>
            <dd>{models}</dd>
          </div>
          {needs.doctorName && (
            <div className="flex flex-wrap gap-x-1">
              <dt className="text-muted">Médecin :</dt>
              <dd>{needs.doctorName}</dd>
            </div>
          )}
        </dl>
        {needsHref && (
          <p>
            <Link href={needsHref} className="text-primary underline">Ajuster les préférences</Link>
          </p>
        )}
      </div>
      <EditSheet title={`${person.firstName} ${person.lastName}`} label="Modifier">
        {(close) => <PersonForm person={person} year={year} onDone={close} />}
      </EditSheet>
    </Card>
  );
}
