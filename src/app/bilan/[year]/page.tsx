import { ArrowRight, CalendarClock, Check, CircleAlert, FileText, MapPin, Pencil, RotateCcw, Scale, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteReviewAction, openReviewAction, reopenReviewAction, undoAction } from "@/app/actions/review";
import { getHousehold, listPersons, listPolicies } from "@/application/household";
import { domicileGroups, openReviewIfPossible, getReviewByYear, getReviewView, type ReviewLineView, type ReviewView } from "@/application/review";
import { reviewDeadlines, isReviewWindowOpen } from "@/domain/deadlines";
import { formatDateLong } from "@/domain/dates";
import { STRATEGY_INFO } from "@/domain/strategy";
import { nextStep } from "../_parts/next-step";
import { AGE_CLASS_LABEL, displayTariffLabel, type ModelType, FIRST_PREMIUM_YEAR } from "@/domain/lamal";
import { DECISION_LABEL } from "@/domain/review";
import { premiumsAvailable } from "@/application/reference-data";
import { currentYear, db, today } from "@/server/context";
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
import { pageScope } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
  return { title: `Bilan ${(await params).year}` };
}


// Le renouvellement est retrouvé automatiquement ; on ne sollicite l'utilisateur que s'il
// faut vraiment choisir (plusieurs produits possibles) ou si la caisse ne propose plus rien.
const RENEWAL_BADGE = {
  MATCHED: null,
  PROBABLE: null,
  AMBIGUOUS: { tone: "increase", label: "Produit à préciser", hint: "Votre caisse propose plusieurs produits proches en {year} : indiquez lequel vous aurez." },
  MISSING: { tone: "increase", label: "Plus proposé", hint: "Votre caisse ne propose plus ce contrat dans votre région en {year} : il faudra en choisir un autre." },
} as const;

export default async function ReviewPage({ params }: { params: Promise<{ year: string }> }) {
  const scope = await pageScope();
  const year = Number((await params).year);
  if (!Number.isInteger(year) || year < FIRST_PREMIUM_YEAR || year > currentYear() + 1) notFound();
  const householdRow = getHousehold(db(), scope);
  const persons = householdRow ? listPersons(db(), householdRow.id) : [];

  if (!householdRow || persons.length === 0) {
    return (
      <Page>
        <PageHeader title={`Bilan ${year}`} />
        <EmptyState icon={<Users aria-hidden />} title="Rien à analyser pour l'instant" action={<Button asChild><Link href="/bienvenue">Commencer</Link></Button>}>
          Indiquez d&apos;abord qui est assuré et le contrat {year - 1}.
        </EmptyState>
      </Page>
    );
  }

  const published = premiumsAvailable(db(), year);
  // Les primes sont publiées : l'analyse s'ouvre d'elle-même (rien n'est décidé à la place de l'utilisateur).
  const windowOpen = isReviewWindowOpen(today(), year, published);
  if (windowOpen && !getReviewByYear(db(), scope, year)) openReviewIfPossible(db(), scope, year);
  const reviewRow = getReviewByYear(db(), scope, year);
  const hasContracts = persons.some((p) => listPolicies(db(), p.id).some((x) => x.policy.coverageYear === year - 1));

  if (!reviewRow) {
    return (
      <Page>
        <PageHeader title={`Bilan ${year}`} subtitle="Hausse et meilleure caisse pour l'année suivante." />
        {published && !windowOpen ? (
          <EmptyState icon={<CalendarClock aria-hidden />} title="Délai passé">
            Les résiliations pour {year} devaient arriver avant le {formatDateLong(reviewDeadlines(year).receiptDeadline)}. Le prochain bilan s&apos;ouvrira à la publication des primes {year + 1}.
          </EmptyState>
        ) : published && !hasContracts ? (
          <EmptyState icon={<CircleAlert aria-hidden />} title={`Contrat${persons.length > 1 ? "s" : ""} ${year - 1} à indiquer`} action={<Button asChild><Link href="/bienvenue?etape=contrats">Indiquer {persons.length > 1 ? "les contrats" : "mon contrat"}</Link></Button>}>
            La hausse se mesure par rapport à {year - 1}.
          </EmptyState>
        ) : published ? (
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

  const view = getReviewView(db(), scope, reviewRow.id, today());
  const closed = view.review.status === "CLOSED";
  const missingPersons = persons.filter((p) => !view.lines.some((x) => x.person.id === p.id));
  return (
    <Page wide>
      <PageHeader title={`Bilan ${year}`} subtitle={closed ? `Clôturé · contrats ${year} créés.` : undefined} />

      {!closed && <DeadlineLine view={view} />}
      {!closed && <DomicileLine view={view} year={year} />}
      {closed && (
        <Alert tone="success" title="C'est terminé">
          {view.lines.some((p) => p.line.decision === "SWITCH" || p.line.decision === "ADJUST")
            ? `Tout est envoyé et vos contrats ${year} sont enregistrés. Gardez les confirmations que les caisses vous enverront.`
            : `Rien à envoyer : vos contrats ${year} sont enregistrés.`}
        </Alert>
      )}
      {!closed && <Steps view={view} />}
      {!closed && view.review.strategy && (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface p-3 text-sm shadow-card">
          <span>
            Préférences : <strong>{STRATEGY_INFO[view.review.strategy].label}</strong>
          </span>
          <Link className="text-primary underline" href={`/bilan/${year}/preferences`}>Modifier</Link>
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
          {view.lines.map((pr, i) => (
            <li key={pr.line.id} id={`ligne-${pr.line.id}`} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              <PersonCard pr={pr} year={year} closed={closed} ready={Boolean(view.review.needsConfirmedAt)} />
            </li>
          ))}
        </ul>
      </Section>

      {!closed && <NextAction view={view} />}

      <OtherActions year={year} reviewId={view.review.id} closed={closed} sentCount={view.letters.filter((l) => l.sentAt).length} />
    </Page>
  );
}

/**
 * Actions rares, en bas de page : après la clôture, modifier ses choix (refus de la nouvelle caisse,
 * erreur) ; à tout moment, recommencer le bilan à zéro.
 */
function OtherActions({ year, reviewId, closed, sentCount }: { year: number; reviewId: number; closed: boolean; sentCount: number }) {
  return (
    <Section title="Autres actions">
      <Card className="space-y-3">
        {closed && (
          <ActionForm action={reopenReviewAction} hidden={{ year, reviewId }}>
            <p className="mb-3 text-sm text-muted">Refus de la nouvelle caisse ou erreur ? Vos choix et courriers sont conservés.</p>
            <ConfirmButton
              variant="secondary"
              block
              message={`Modifier vos choix ${year} ?`}
              confirmLabel="Modifier mes choix"
              confirmVariant="primary"
              details={<p>Les contrats {year} enregistrés sont retirés le temps de corriger ; ils reviennent dès que tout est de nouveau envoyé.</p>}
            >
              <Pencil aria-hidden className="size-4" /> Modifier mes choix
            </ConfirmButton>
          </ActionForm>
        )}
        <ActionForm action={deleteReviewAction} hidden={{ year, reviewId }}>
          <ConfirmButton
            variant="ghost"
            block
            message={`Recommencer le bilan ${year} ?`}
            confirmLabel="Recommencer"
            confirmVariant="primary"
            details={
              <div className="space-y-2">
                <p>
                  Vos choix et vos courriers {year} seront effacés{closed ? `, ainsi que les contrats ${year} enregistrés` : ""}, et le bilan repartira des nouvelles primes. Vos
                  contrats {year - 1} ne changent pas.
                </p>
                <p className={sentCount > 0 ? "font-semibold" : undefined}>Les courriers déjà postés ne sont pas annulés.</p>
              </div>
            }
          >
            <RotateCcw aria-hidden className="size-4" /> Recommencer à zéro
          </ConfirmButton>
        </ActionForm>
      </Card>
    </Section>
  );
}

/** Échéance du bilan en une ligne (la carte de l'année est sur l'accueil). */
function DeadlineLine({ view }: { view: ReviewView }) {
  const late = view.urgency === "late";
  const pressing = view.urgency === "urgent" || late;
  return (
    <p className={cn("flex items-center gap-2 rounded-xl p-3 text-sm shadow-card", pressing ? "bg-increase-soft text-increase" : "bg-surface")}>
      <CalendarClock aria-hidden className="size-4 shrink-0" />
      <span className="flex-1">
        {late ? "Délai passé : " : "Pour changer, courrier reçu par la caisse au plus tard le "}
        {late ? "votre caisse renouvelle aux nouvelles conditions." : <strong>{formatDateLong(view.deadlines.receiptDeadline)}</strong>}
      </span>
      {!late && <span className="shrink-0 font-semibold tabular">J-{view.daysToDeadline}</span>}
    </p>
  );
}

/** Domicile au 1er janvier de l'année cible : les primes comparées sont celles de cette commune. */
function DomicileLine({ view, year }: { view: ReviewView; year: number }) {
  const groups = domicileGroups(view.lines.map((p) => p.line));
  const name = (id: number) => view.lines.find((p) => p.person.id === id)?.person.firstName ?? "";
  return (
    <p className="flex items-center gap-2 rounded-xl bg-surface p-3 text-sm shadow-card">
      <MapPin aria-hidden className="size-4 shrink-0" />
      <span className="flex-1">
        Domicile au 1er janvier {year} :{" "}
        {groups.length === 1
          ? <strong>{groups[0]!.label}</strong>
          : groups.map((g, i) => (
              <span key={g.label}>
                {i > 0 && " ; "}
                <strong>{g.label}</strong> pour {g.personIds.map(name).join(", ")}
              </span>
            ))}
      </span>
      <Link className="shrink-0 text-primary underline" href={`/bilan/${year}/domicile`} aria-label={`Modifier le domicile au 1er janvier ${year}`}>
        Modifier
      </Link>
    </p>
  );
}

function Steps({ view }: { view: ReviewView }) {
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Étapes du bilan">
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

function PersonCard({ pr, year, closed, ready }: { pr: ReviewLineView; year: number; closed: boolean; ready: boolean }) {
  const badge = RENEWAL_BADGE[pr.line.renewalStatus];
  const decided = pr.line.decision !== "UNDECIDED";
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{pr.person.firstName}</p>
          <p className="text-sm text-muted">
            {pr.currentInsurerName} · {displayTariffLabel(pr.policy.tariffLabel, pr.policy.modelType as ModelType)} · franchise {pr.policy.franchiseChf}
          </p>
        </div>
        <Badge tone={decided ? (pr.line.decision === "KEEP" ? "primary" : "saving") : "neutral"}>{DECISION_LABEL[pr.line.decision]}</Badge>
      </div>

      {pr.ageTransitionMessage && (
        <Alert tone="info" title={AGE_CLASS_LABEL[pr.line.targetAgeClass]}>
          {pr.ageTransitionMessage}
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
          <span className="text-muted">
            {pr.line.renewalStatus === "MISSING" && pr.line.canton !== pr.policy.canton
              ? `Votre caisse n'assure pas dans le canton ${pr.line.canton} : choisissez-en une autre. Avec le déménagement, votre contrat actuel prend fin (LAMal, art. 7 al. 3).`
              : badge.hint.replace("{year}", String(year))}
          </span>
        </p>
      )}

      {decided && pr.line.chosenMonthlyRp !== null ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-saving/30 bg-saving-soft/50 p-3 text-sm">
          <div>
            <p className="font-medium">
              {pr.chosenInsurerName} · {displayTariffLabel(pr.line.chosenLabel, (pr.line.chosenModelType ?? "OTHER") as ModelType)}
            </p>
            <p className="text-muted">Franchise {pr.line.chosenFranchiseChf}</p>
          </div>
          <p className="font-semibold">
            <Chf rp={pr.line.chosenMonthlyRp} />
          </p>
        </div>
      ) : (
        pr.bestOffer && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted">
              Meilleure offre : <span className="font-medium text-foreground">{pr.bestOffer.insurerName}</span>, franchise {pr.bestOffer.franchiseChf}
            </p>
            <Saving rp={pr.bestOffer.savingsRp} />
          </div>
        )
      )}



      {!closed && (
        <div className="flex gap-2">
          <Button asChild block variant={decided || !ready ? "secondary" : "primary"}>
            <Link href={`/bilan/${year}/personne/${pr.line.id}`}>
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
  if (step.kind === "none") {
    const needsLetters = view.lines.some((p) => p.line.decision === "SWITCH" || p.line.decision === "ADJUST");
    return needsLetters ? null : (
      <Alert tone="success" title="Rien à envoyer">
        {view.lines.length > 1 ? "Toutes les personnes gardent leur contrat" : "Vous gardez votre contrat"} : aucun courrier n&apos;est nécessaire.
      </Alert>
    );
  }
  const Icon = step.kind === "compare" ? Scale : step.kind === "procedures" ? FileText : ArrowRight;
  return (
    <div className="sticky bottom-20 z-30 lg:bottom-6">
      <Button asChild block size="lg" className="shadow-lg">
        <Link href={step.href}>
          <Icon aria-hidden className="size-5" />
          {step.label}
        </Link>
      </Button>
    </div>
  );
}
