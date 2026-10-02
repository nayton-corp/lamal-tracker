import { ArrowRight, CalendarClock, Check, CircleAlert, FileText, RotateCcw, Scale, ShieldAlert, Sparkles, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { closeReviewAction, deleteReviewAction, openReviewAction, reopenReviewAction, undoAction } from "@/app/actions/review";
import { getHousehold, listPersons, listPolicies } from "@/application/household";
import { ensureReview, getReviewByYear, getReviewView, type PersonReview, type ReviewView } from "@/application/review";
import { reviewDeadlines, ritualWindowOpen } from "@/domain/deadlines";
import { formatDateLong } from "@/domain/dates";
import { STRATEGY_INFO } from "@/domain/strategy";
import { Awareness } from "../_parts/awareness";
import { nextStep } from "../_parts/next-step";
import { AGE_CLASS_LABEL, displayTariffLabel, type ModelType } from "@/domain/lamal";
import { DECISION_LABEL } from "@/domain/review";
import { activeDataset } from "@/infrastructure/db/queries";
import { db, today } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { cn } from "@/ui/cn";
import { ConfirmButton } from "@/ui/confirm-button";
import { Chf, Delta, Saving } from "@/ui/money";
import { EmptyState, Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
  return { title: `Rituel ${(await params).year}` };
}


// Le renouvellement est retrouvé automatiquement ; on ne sollicite l'utilisateur que s'il
// faut vraiment choisir (plusieurs produits possibles) ou si la caisse ne propose plus rien.
const RENEWAL_BADGE = {
  MATCHED: null,
  PROBABLE: null,
  AMBIGUOUS: { tone: "increase", label: "Produit à préciser", hint: "Votre caisse propose plusieurs produits proches en {year} : indiquez lequel vous aurez." },
  MISSING: { tone: "increase", label: "Plus proposé", hint: "Votre caisse ne propose plus ce contrat dans votre région en {year} : il faudra en choisir un autre." },
} as const;

export default async function RitualPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  if (!Number.isInteger(year) || year < 2011 || year > Number(today().slice(0, 4)) + 1) notFound();
  const h = getHousehold(db());
  const persons = h ? listPersons(db(), h.id) : [];

  if (!h || persons.length === 0) {
    return (
      <Page>
        <PageHeader title={`Rituel ${year}`} />
        <EmptyState icon={<Users aria-hidden />} title="Rien à analyser pour l'instant" action={<Button asChild><Link href="/bienvenue">Commencer</Link></Button>}>
          Indiquez d&apos;abord qui est assuré et le contrat {year - 1}.
        </EmptyState>
      </Page>
    );
  }

  const dataset = activeDataset(db(), year);
  // Les primes sont publiées : l'analyse s'ouvre d'elle-même (rien n'est décidé à la place de l'utilisateur).
  const windowOpen = ritualWindowOpen(today(), year, Boolean(dataset));
  if (windowOpen && !getReviewByYear(db(), year)) ensureReview(db(), year);
  const reviewRow = getReviewByYear(db(), year);
  const hasContracts = persons.some((p) => listPolicies(db(), p.id).some((x) => x.policy.coverageYear === year - 1));

  if (!reviewRow) {
    return (
      <Page>
        <PageHeader title={`Rituel ${year}`} subtitle="Hausse et meilleure caisse pour l'année suivante." />
        {dataset && !windowOpen ? (
          <EmptyState icon={<CalendarClock aria-hidden />} title="Délai passé">
            Les résiliations pour {year} devaient arriver avant le {formatDateLong(reviewDeadlines(year).receiptDeadline)}. Le prochain rituel s&apos;ouvrira à la publication des primes {year + 1}.
          </EmptyState>
        ) : dataset && !hasContracts ? (
          <EmptyState icon={<CircleAlert aria-hidden />} title={`Contrat${persons.length > 1 ? "s" : ""} ${year - 1} à indiquer`} action={<Button asChild><Link href="/bienvenue?etape=contrats">Indiquer {persons.length > 1 ? "les contrats" : "mon contrat"}</Link></Button>}>
            La hausse se mesure par rapport à {year - 1}.
          </EmptyState>
        ) : dataset ? (
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Sparkles aria-hidden />
              </div>
              <div>
                <p className="font-semibold">Les primes {year} sont disponibles</p>
                <p className="text-sm text-muted">{persons.length} personne(s) à analyser.</p>
              </div>
            </div>
            <ActionForm action={openReviewAction} hidden={{ year }}>
              <SubmitButton block size="lg" pendingLabel="Analyse…">
                Lancer l&apos;analyse {year}
              </SubmitButton>
            </ActionForm>
          </Card>
        ) : (
          <EmptyState icon={<CalendarClock aria-hidden />} title={`Primes ${year} pas encore publiées`} action={<Button asChild variant="secondary"><Link href="/donnees">Vérifier maintenant</Link></Button>}>
            Publiées fin septembre par l&apos;OFSP, téléchargées automatiquement.
          </EmptyState>
        )}
      </Page>
    );
  }

  const view = getReviewView(db(), reviewRow.id, today());
  const closed = view.review.status === "CLOSED";
  const missingPersons = persons.filter((p) => !view.persons.some((x) => x.person.id === p.id));
  return (
    <Page wide>
      <PageHeader title={`Rituel ${year}`} subtitle={closed ? `Clôturé · contrats ${year} créés.` : `${h.canton}, région ${h.region}`} />

      <Awareness view={view} detailed={false} cta={false} />
      {!closed && <Steps view={view} />}
      {!closed && view.review.strategy && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface p-3 text-sm shadow-card">
          <span>
            Stratégie : <strong>{STRATEGY_INFO[view.review.strategy].label}</strong>
          </span>
          <span className="flex gap-3">
            <Link className="text-primary underline" href={`/rituel/${year}/strategie`}>Changer</Link>
            <Link className="text-primary underline" href={`/rituel/${year}/besoins`}>Mes besoins</Link>
          </span>
        </p>
      )}

      {!view.co2KnownForTarget && (
        <Alert tone="info" title={`Redistribution CO2 ${year} pas encore publiée`}>
          Les primes sont affichées sans cette déduction ; elle s&apos;ajoutera seule dès sa publication par l&apos;OFEV.
        </Alert>
      )}
      {missingPersons.length > 0 && !closed && (
        <ActionForm action={openReviewAction} hidden={{ year }}>
          <Alert tone="info" title="Foyer modifié">
            {missingPersons.map((p) => p.firstName).join(", ")} ne figure pas encore dans l&apos;analyse.
          </Alert>
          <SubmitButton variant="secondary" size="sm" className="mt-2">Actualiser l&apos;analyse</SubmitButton>
        </ActionForm>
      )}

      <Section title="Par personne">
        <ul className="grid gap-3 lg:grid-cols-2">
          {view.persons.map((pr, i) => (
            <li key={pr.line.id} id={`ligne-${pr.line.id}`} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <PersonCard pr={pr} year={year} closed={closed} ready={Boolean(view.review.needsConfirmedAt)} />
            </li>
          ))}
        </ul>
      </Section>

      {!closed && <NextAction view={view} />}

      {!closed && ["confirm", "close"].includes(nextStep(view).kind) && (
        <Section title="Clôture">
          <Card className="space-y-3">
            <p className="text-sm text-muted">Après réception des nouvelles polices : vos contrats {year} seront enregistrés tels que choisis.</p>
            <ActionForm action={closeReviewAction} hidden={{ year, reviewId: view.review.id }}>
              <SubmitButton variant="secondary" block pendingLabel="Clôture…">
                Clôturer le rituel {year}
              </SubmitButton>
            </ActionForm>
          </Card>
        </Section>
      )}

      <Undo year={year} reviewId={view.review.id} closed={closed} />
    </Page>
  );
}

/** Revenir en arrière, même après la clôture : rouvrir (on garde les choix) ou tout effacer. */
function Undo({ year, reviewId, closed }: { year: number; reviewId: number; closed: boolean }) {
  return (
    <Section title="Revenir en arrière">
      <Card className="space-y-3">
        {closed && (
          <ActionForm action={reopenReviewAction} hidden={{ year, reviewId }}>
            <p className="mb-3 text-sm text-muted">Erreur ou refus de la caisse ? Rouvrez : vos choix sont conservés.</p>
            <ConfirmButton
              variant="secondary"
              block
              message={`Rouvrir le rituel ${year} ?`}
              confirmLabel="Rouvrir"
              confirmVariant="primary"
              details={<p>Les contrats {year} créés à la clôture sont retirés ; vos choix et lettres sont conservés.</p>}
            >
              <RotateCcw aria-hidden className="size-4" /> Rouvrir le rituel
            </ConfirmButton>
          </ActionForm>
        )}
        <ActionForm action={deleteReviewAction} hidden={{ year, reviewId }}>
          <ConfirmButton
            variant="ghost"
            block
            className="text-increase hover:bg-increase-soft"
            message={`Supprimer le rituel ${year} ?`}
            confirmLabel="Supprimer le rituel"
            details={
              <p>Choix et lettres {year} effacés{closed ? `, contrats ${year} créés à la clôture compris` : ""}. Les contrats {year - 1} restent.</p>
            }
          >
            <Trash2 aria-hidden className="size-4" /> Supprimer ce rituel
          </ConfirmButton>
        </ActionForm>
      </Card>
    </Section>
  );
}

function Steps({ view }: { view: ReviewView }) {
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="Étapes du rituel">
      {view.steps.map((s, i) => (
        <li key={s.key} className="flex flex-col items-center gap-1 text-center">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-sm font-semibold",
              s.done ? "bg-saving text-white dark:text-black" : "bg-surface-2 text-muted",
            )}
            aria-hidden
          >
            {s.done ? <Check className="size-4" /> : i + 1}
          </span>
          <span className={cn("text-xs leading-tight", s.done ? "text-foreground" : "text-muted")}>
            {s.label}
            <span className="sr-only">{s.done ? " : fait" : " : à faire"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function PersonCard({ pr, year, closed, ready }: { pr: PersonReview; year: number; closed: boolean; ready: boolean }) {
  const badge = RENEWAL_BADGE[pr.line.renewalStatus];
  const decided = pr.line.decision !== "UNDECIDED";
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{pr.person.firstName}</p>
          <p className="text-sm text-muted">
            {pr.currentInsurer} · {displayTariffLabel(pr.policy.tariffLabel, pr.policy.modelType as ModelType)} · franchise {pr.policy.franchiseChf}
          </p>
        </div>
        <Badge tone={decided ? (pr.line.decision === "KEEP" ? "primary" : "saving") : "neutral"}>{DECISION_LABEL[pr.line.decision]}</Badge>
      </div>

      {pr.transition && (
        <Alert tone="info" title={AGE_CLASS_LABEL[pr.line.targetAgeClass]}>
          {pr.transition}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 text-sm">
        <div>
          <p className="text-muted">{year - 1}</p>
          <p className="text-base font-semibold">
            <Chf rp={pr.policy.billedMonthlyRp} />
          </p>
        </div>
        <div>
          <p className="text-muted">
            {year}, même contrat{pr.line.renewalFranchiseChf !== pr.policy.franchiseChf ? ` (franchise ${pr.line.renewalFranchiseChf})` : ""}
          </p>
          <p className="text-base font-semibold">
            <Chf rp={pr.line.renewalMonthlyRp} />
          </p>
          <Delta rp={pr.increaseRp} permille={pr.increasePermille} className="text-sm" />
        </div>
      </div>
      {badge && (
        <p className="flex items-center gap-2 text-sm">
          <Badge tone={badge.tone}>
            <CircleAlert aria-hidden className="size-3.5" />
            {badge.label}
          </Badge>
          <span className="text-muted">{badge.hint.replace("{year}", String(year))}</span>
        </p>
      )}

      {decided && pr.line.chosenMonthlyRp !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-saving/30 bg-saving-soft/50 p-3 text-sm">
          <div>
            <p className="font-medium">
              {pr.chosenInsurer} · {displayTariffLabel(pr.line.chosenLabel, (pr.line.chosenModelType ?? "OTHER") as ModelType)}
            </p>
            <p className="text-muted">Franchise {pr.line.chosenFranchiseChf}</p>
          </div>
          <p className="font-semibold">
            <Chf rp={pr.line.chosenMonthlyRp} />
          </p>
        </div>
      ) : (
        pr.best && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted">
              Meilleure offre : <span className="font-medium text-foreground">{pr.best.insurerName}</span>, franchise {pr.best.franchiseChf}
            </p>
            <Saving rp={pr.best.savingsRp} />
          </div>
        )
      )}

      {pr.line.decision === "SWITCH" && pr.lcaCount > 0 && !pr.line.lcaAckAt && (
        <p className="flex items-center gap-2 rounded-lg bg-lca-soft p-2 text-sm font-medium text-lca">
          <ShieldAlert aria-hidden className="size-4 shrink-0" /> {pr.lcaCount} complémentaire(s) LCA à protéger
        </p>
      )}

      {!closed && (
        <div className="flex gap-2">
          <Button asChild block variant={decided || !ready ? "secondary" : "primary"}>
            <Link href={`/rituel/${year}/personne/${pr.line.id}`}>
              <Scale aria-hidden className="size-4" /> {decided ? "Revoir" : "Comparer"}
            </Link>
          </Button>
          {decided && (
            <ActionForm action={undoAction} hidden={{ lineId: pr.line.id }}>
              <SubmitButton variant="ghost" pendingLabel="…">Annuler le choix</SubmitButton>
            </ActionForm>
          )}
        </div>
      )}
    </Card>
  );
}

function NextAction({ view }: { view: ReviewView }) {
  const step = nextStep(view);
  if (step.kind === "close" || step.kind === "none") {
    const needsLetters = view.persons.some((p) => p.line.decision === "SWITCH" || p.line.decision === "ADJUST");
    return needsLetters ? null : (
      <Alert tone="success" title="Rien à envoyer">
        {view.persons.length > 1 ? "Toutes les personnes gardent leur contrat" : "Vous gardez votre contrat"} : aucun courrier n&apos;est nécessaire.
      </Alert>
    );
  }
  const Icon = step.kind === "compare" ? Scale : step.kind === "lca" ? ShieldAlert : step.kind === "procedures" || step.kind === "confirm" ? FileText : ArrowRight;
  return (
    <div className="sticky bottom-20 z-30 lg:bottom-6">
      <Button asChild block size="lg" variant={step.kind === "lca" ? "lca" : "primary"} className="shadow-lg">
        <Link href={step.href}>
          <Icon aria-hidden className="size-5" />
          {step.label}
        </Link>
      </Button>
    </div>
  );
}
