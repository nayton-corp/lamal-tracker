import { ArrowRight, Check, Pencil, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { chooseModeAction } from "@/app/actions/journey";
import { getHousehold, getHouseholdMode, listInsurers, listPersons, listPolicies } from "@/application/household";
import { formatDateShort } from "@/domain/dates";
import { insurerLabel } from "@/infrastructure/db/queries";
import { db, today } from "@/server/context";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Page } from "@/ui/page";
import { ContractsStep, IdentityStep, MemberAdder } from "./steps";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bienvenue" };

type StepKey = "structure" | "vous" | "adresse" | "membres" | "contrats";

const SOLO_STEPS: { key: StepKey; label: string }[] = [
  { key: "structure", label: "Pour qui" },
  { key: "vous", label: "Vous" },
  { key: "contrats", label: "Contrat" },
];
const FAMILY_STEPS: { key: StepKey; label: string }[] = [
  { key: "structure", label: "Pour qui" },
  { key: "adresse", label: "Adresse" },
  { key: "membres", label: "Personnes" },
  { key: "contrats", label: "Contrats" },
];

/**
 * Accueil de la première connexion. Seul·e : pour qui → vous (identité + adresse, ou la police
 * PDF) → votre contrat. Foyer : pour qui → adresse (ou la police PDF) → personnes → contrats.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ etape?: string }> }) {
  const asked = (await searchParams).etape as StepKey | undefined;
  const h = getHousehold(db());
  const mode = getHouseholdMode(db());
  const solo = mode === "SOLO";
  const year = Number(today().slice(0, 4));
  const persons = h ? listPersons(db(), h.id) : [];
  const withContracts = persons.map((p) => {
    const current = listPolicies(db(), p.id).find((x) => x.policy.coverageYear === year);
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      employed: p.employedAccidentCover,
      birth: p.birthDate,
      contract: current ? `${insurerLabel(current.insurer)} · franchise ${current.policy.franchiseChf}` : null,
    };
  });

  const steps = solo ? SOLO_STEPS : FAMILY_STEPS;
  const done: Record<StepKey, boolean> = {
    structure: mode !== null,
    vous: Boolean(h) && persons.length > 0,
    adresse: Boolean(h),
    membres: persons.length > 0,
    contrats: persons.length > 0 && withContracts.every((p) => p.contract),
  };
  const firstOpen = steps.find((s) => !done[s.key])?.key ?? "contrats";
  // On ne saute pas une étape dont les prérequis manquent.
  const order = steps.map((s) => s.key);
  const step: StepKey = asked && order.includes(asked) && order.indexOf(asked) <= order.indexOf(firstOpen) ? asked : firstOpen;
  const insurers = listInsurers(db())
    .map((i) => ({ id: i.id, name: insurerLabel(i) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const years = Array.from({ length: year + 2 - 2010 }, (_, i) => year + 1 - i);
  const first = persons[0];

  return (
    <Page>
      <header className="space-y-2 pt-6 lg:pt-0">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Primes LAMal</p>
        <h1 className="text-3xl font-bold leading-tight text-balance">{step === "structure" ? "Payez le juste prix pour votre assurance de base." : TITLES[step](solo)}</h1>
        {step === "structure" && <p className="text-muted">Quelques minutes aujourd&apos;hui. Chaque automne, l&apos;app mesure la hausse, cherche mieux et prépare les courriers.</p>}
      </header>

      <ol className={cn("grid gap-2", steps.length === 3 ? "grid-cols-3" : "grid-cols-4")} aria-label="Étapes de l'accueil">
        {steps.map((s, i) => (
          <li key={s.key} className="space-y-1 text-center text-xs">
            <span className={cn("mx-auto flex size-7 items-center justify-center rounded-full font-semibold", done[s.key] ? "bg-saving text-white dark:text-black" : s.key === step ? "bg-primary text-on-primary" : "bg-surface-2 text-muted")} aria-hidden>
              {done[s.key] ? <Check className="size-4" /> : i + 1}
            </span>
            <span className={s.key === step ? "font-semibold" : "text-muted"}>
              {s.label}
              <span className="sr-only">{done[s.key] ? " : fait" : s.key === step ? " : en cours" : " : à faire"}</span>
            </span>
          </li>
        ))}
      </ol>

      {step === "structure" && (
        <form action={chooseModeAction} className="space-y-3">
          <p className="font-medium">Pour qui gérez-vous l&apos;assurance maladie ?</p>
          <ModeButton value="SOLO" icon={<UserRound aria-hidden className="size-6" />} title="Pour moi seul·e" text="Votre contrat, vos échéances, vos économies." active={mode === "SOLO"} disabled={persons.length > 1} />
          <ModeButton value="FAMILY" icon={<Users aria-hidden className="size-6" />} title="Pour mon foyer" text="Plusieurs personnes, un seul rituel pour tous." active={mode === "FAMILY"} />
          {persons.length > 1 && <p className="text-sm text-muted">Plusieurs personnes sont déjà enregistrées : le mode foyer s&apos;applique.</p>}
        </form>
      )}

      {(step === "vous" || step === "adresse") && (
        <IdentityStep
          household={h}
          person={solo ? (first ? { firstName: first.firstName, lastName: first.lastName, birthDate: first.birthDate } : null) : undefined}
          insurers={insurers}
          years={years}
          next={solo ? "/bienvenue?etape=contrats" : "/bienvenue?etape=membres"}
        />
      )}

      {step === "membres" && (
        <div className="space-y-4">
          {persons.length > 0 && (
            <ul className="space-y-2">
              {withContracts.map((p) => (
                <li key={p.id} className="flex min-h-12 items-center gap-3 rounded-xl bg-surface p-3 shadow-card">
                  <UserRound aria-hidden className="size-5 text-primary" />
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-sm text-muted">{formatDateShort(p.birth)}</span>
                  <Link href={`/foyer/personne/${p.id}?retour=bienvenue`} className="flex size-10 items-center justify-center rounded-full text-primary hover:bg-primary-soft" aria-label={`Modifier ${p.name}`}>
                    <Pencil aria-hidden className="size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Card className="space-y-3">
            <p className="font-medium">{persons.length ? "Une autre personne ?" : "Première personne"}</p>
            <MemberAdder year={year} first={persons.length === 0} />
          </Card>
          {persons.length > 0 && (
            <Button asChild block size="lg">
              <Link href="/bienvenue?etape=contrats">
                C&apos;est tout le monde <ArrowRight aria-hidden className="size-5" />
              </Link>
            </Button>
          )}
        </div>
      )}

      {step === "contrats" && (
        <div className="space-y-4">
          <p className="text-muted">{solo ? "Votre contrat" : "Le contrat de chaque personne"} pour {year} : la référence pour mesurer la hausse et les économies.</p>
          <ContractsStep persons={withContracts.map(({ id, name, employed, contract }) => ({ id, name, employed, contract }))} insurers={insurers} year={year} years={years} solo={solo} />
          {done.contrats ? (
            <Button asChild block size="lg">
              <Link href="/">
                C&apos;est prêt : voir mon tableau de bord <ArrowRight aria-hidden className="size-5" />
              </Link>
            </Button>
          ) : (
            <p className="text-center text-sm">
              <Link href="/" className="text-primary underline">
                Terminer plus tard
              </Link>
            </p>
          )}
        </div>
      )}
    </Page>
  );
}

const TITLES: Record<Exclude<StepKey, "structure">, (solo: boolean) => string> = {
  vous: () => "Qui êtes-vous ?",
  adresse: () => "Où habite votre foyer ?",
  membres: () => "Qui est assuré dans votre foyer ?",
  contrats: (solo) => (solo ? "Votre contrat actuel" : "Les contrats actuels"),
};

function ModeButton({ value, icon, title, text, active, disabled }: { value: string; icon: React.ReactNode; title: string; text: string; active: boolean; disabled?: boolean }) {
  return (
    <button
      name="mode"
      value={value}
      disabled={disabled}
      className={cn(
        "flex w-full cursor-pointer items-center gap-4 rounded-2xl border-2 bg-surface p-4 text-left shadow-card transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-primary" : "border-border",
      )}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
      <ArrowRight aria-hidden className="size-5 text-muted" />
    </button>
  );
}
