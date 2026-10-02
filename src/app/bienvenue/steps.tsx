"use client";

import { CheckCircle2, ClipboardList, FileText, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HouseholdForm, type SoloIdentity } from "@/app/foyer/household-form";
import { ImportFlow } from "@/app/foyer/importer/import-flow";
import { PersonForm } from "@/app/foyer/person-form";
import { PolicyWizard } from "@/app/foyer/policy-wizard";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { PolicyStart } from "./policy-start";

type Insurers = { id: number; name: string }[];

/**
 * Identité et adresse : la police PDF remplit tout (personnes, adresse, puis contrats), sinon
 * un formulaire. `person` absent = mode foyer (adresse seule) ; sinon identité + adresse.
 */
export function IdentityStep({ household, person, insurers, years, next }: {
  household: Parameters<typeof HouseholdForm>[0]["household"];
  person?: SoloIdentity | null;
  insurers: Insurers;
  years: number[];
  next: string;
}) {
  const router = useRouter();
  const solo = person !== undefined;
  const [mode, setMode] = useState<"pdf" | "manual" | null>(household ? "manual" : null);
  const form = <HouseholdForm household={household} person={person} next={next} submitLabel="Continuer" onDone={() => router.push(next)} />;

  // Même arbre quel que soit l'état : l'enregistrement rafraîchit la page sans démonter le formulaire.
  return (
    <div className="space-y-4">
      {!household && (
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Comment commencer">
          <ChoiceCard active={mode === "pdf"} onClick={() => setMode("pdf")} icon={<FileText aria-hidden className="size-6" />} title="Depuis ma police (PDF)" badge="Recommandé" text={solo ? "Nom, adresse et contrat sont lus dans la police. Vous vérifiez." : "Personnes, adresse et contrats sont lus dans la police. Vous vérifiez."} />
          <ChoiceCard active={mode === "manual"} onClick={() => setMode("manual")} icon={<ClipboardList aria-hidden className="size-6" />} title="Saisir à la main" text={solo ? "Votre nom, votre date de naissance et votre adresse." : "L'adresse du foyer, puis chaque personne."} />
        </div>
      )}
      {mode === "pdf" && <PolicyStart insurers={insurers} years={years} solo={solo} />}
      {(mode === "manual" || (Boolean(household) && mode !== "pdf")) && <Card>{form}</Card>}
    </div>
  );
}

/** Ajout d'une personne après l'autre ; le formulaire se vide après chaque ajout. */
export function MemberAdder({ year, first }: { year: number; first: boolean }) {
  const router = useRouter();
  const [n, setN] = useState(0);
  return (
    <PersonForm
      key={n}
      person={null}
      year={year}
      stay
      submitLabel={first ? "Ajouter cette personne" : "Ajouter une autre personne"}
      onDone={() => {
        setN((x) => x + 1);
        router.refresh();
      }}
    />
  );
}

export interface ContractPerson {
  id: number;
  name: string;
  employed: boolean;
  contract: string | null;
}

/** Contrats actuels : la police PDF remplit tout d'un coup, ou une saisie guidée par personne. */
export function ContractsStep({ persons, insurers, year, years, solo }: { persons: ContractPerson[]; insurers: Insurers; year: number; years: number[]; solo: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"pdf" | "manual" | null>(null);
  const [manualFor, setManualFor] = useState<number | null>(persons.find((p) => !p.contract)?.id ?? null);
  const missing = persons.filter((p) => !p.contract);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {persons.map((p) => (
          <li key={p.id} className="flex min-h-12 items-center gap-3 rounded-xl bg-surface p-3 shadow-card">
            <UserRound aria-hidden className="size-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{p.name}</span>
              <span className="block truncate text-sm text-muted">{p.contract ?? `Contrat ${year} à indiquer`}</span>
            </span>
            {p.contract ? (
              <Badge tone="saving">
                <CheckCircle2 aria-hidden className="size-3.5" /> Fait
              </Badge>
            ) : (
              <Badge>À faire</Badge>
            )}
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Comment indiquer les contrats">
          <ChoiceCard active={mode === "pdf"} onClick={() => setMode("pdf")} icon={<FileText aria-hidden className="size-6" />} title="Importer la police (PDF)" badge="Recommandé" text={solo ? "Caisse, modèle, franchise, prime : tout est rempli, vous vérifiez." : "Une police couvre souvent tout le foyer : tout est rempli, vous vérifiez."} />
          <ChoiceCard active={mode === "manual"} onClick={() => setMode("manual")} icon={<ClipboardList aria-hidden className="size-6" />} title="Saisie guidée" text="Caisse, modèle, franchise : la prime officielle est retrouvée." />
        </div>
      )}

      {missing.length > 0 && mode === "pdf" && <ImportFlow hasPersons insurers={insurers} years={years} onSaved={() => router.refresh()} />}

      {missing.length > 0 && mode === "manual" && (
        <Card className="space-y-4">
          {missing.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Personne">
              {missing.map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={manualFor === p.id}
                  onClick={() => setManualFor(p.id)}
                  className={cn("min-h-11 cursor-pointer rounded-full border px-4 text-sm font-medium", manualFor === p.id ? "border-primary bg-primary text-on-primary" : "border-border")}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {missing
            .filter((p) => p.id === (manualFor ?? missing[0]!.id))
            .map((p) => (
              <PolicyWizard
                key={p.id}
                personId={p.id}
                personName={p.name.split(" ")[0]!}
                year={year}
                insurers={insurers}
                employed={p.employed}
                onDone={() => {
                  setManualFor(missing.find((x) => x.id !== p.id)?.id ?? null);
                  router.refresh();
                }}
              />
            ))}
        </Card>
      )}
    </div>
  );
}

function ChoiceCard({ active, onClick, icon, title, text, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string; badge?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col items-start gap-2 rounded-2xl border-2 bg-surface p-4 text-left shadow-card transition-colors",
        active ? "border-primary bg-primary-soft/40" : "border-border hover:bg-surface-2",
      )}
    >
      <span className="flex w-full items-center justify-between gap-2 text-primary">
        {icon}
        {badge && <Badge tone="primary">{badge}</Badge>}
      </span>
      <span className="font-semibold">{title}</span>
      <span className="text-sm text-muted">{text}</span>
    </button>
  );
}
