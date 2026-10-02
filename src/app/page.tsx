import Link from "next/link";
import { reviewOverview } from "@/application/review";
import { formatDateFr } from "@/domain/calendar";
import { isReviewSeason, reviewTargetYear } from "@/domain/deadlines";
import { MODEL_SHORT, type ModelType } from "@/domain/insurance-model";
import { formatChf } from "@/domain/money";
import { app } from "@/server/app";
import { ActionForm, SubmitButton } from "@/ui/action-form";
import { Chf } from "@/ui/amount";
import { Badge, ButtonLink, Card, CardTitle, ListRow, Notice } from "@/ui/primitives";
import { PersonCards, RitualActions, RitualHeader } from "@/ui/ritual/overview";
import { openReviewAction } from "./actions";

export default function HomePage() {
  const ctx = app();
  const today = ctx.clock.today();
  const targetYear = reviewTargetYear(today);
  const h = ctx.household.household();
  const persons = h ? ctx.household.persons(h.id) : [];
  const coverageYear = isReviewSeason(today) ? targetYear - 1 : Number(today.slice(0, 4));
  const policies = persons.map((p) => ({ person: p, policy: ctx.household.policyFor(p.id, coverageYear) }));
  const datasetNext = ctx.tariffs.activeDataset(targetYear);
  const stagingNext = ctx.tariffs.listDatasets().find((d) => d.year === targetYear && d.status === "STAGING");
  const review = h ? ctx.reviews.reviewFor(h.id, targetYear) : undefined;

  const setup = [
    { done: Boolean(h), label: "Décris ton foyer (commune, région de primes)", href: "/foyer/edition" },
    { done: persons.length > 0, label: "Ajoute les personnes du foyer", href: "/foyer/personne/nouvelle" },
    {
      done: persons.length > 0 && policies.every((p) => p.policy),
      label: `Saisis les contrats LAMal ${coverageYear}`,
      href: "/foyer",
    },
    {
      done: ctx.tariffs.activeYears().length > 0,
      label: "Importe les primes officielles OFSP",
      href: "/reglages/primes",
    },
  ];
  const setupDone = setup.every((s) => s.done);

  if (review && review.status !== "CLOSED") {
    const overview = reviewOverview(ctx, review.id);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">Rituel {targetYear}</h1>
        <RitualHeader overview={overview} />
        <PersonCards overview={overview} />
        <RitualActions overview={overview} />
      </div>
    );
  }

  const totalMonthly = policies.reduce((s, p) => s + (p.policy?.billedMonthlyRp ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Bonjour{persons[0] ? ` ${persons[0].firstName}` : ""}</h1>

      {!setupDone && (
        <Card>
          <CardTitle>Mise en route</CardTitle>
          <ol className="flex flex-col">
            {setup.map((s, i) => (
              <ListRow key={s.label} href={s.done ? undefined : s.href} trailing={s.done ? <Badge tone="down">✓ Fait</Badge> : null}>
                <span className={s.done ? "text-muted line-through" : "font-medium"}>
                  {i + 1}. {s.label}
                </span>
              </ListRow>
            ))}
          </ol>
        </Card>
      )}

      {review?.status === "CLOSED" && (
        <Notice tone="down" title={`Rituel ${targetYear} terminé`}>
          Les contrats {targetYear} sont enregistrés.{" "}
          <Link href={`/rituel/${targetYear}`} className="font-semibold underline">
            Revoir le rituel
          </Link>
        </Notice>
      )}

      {h && !review && isReviewSeason(today) && (
        <Card className="border-primary/40">
          <CardTitle>Rituel d&apos;automne {targetYear}</CardTitle>
          {datasetNext ? (
            <>
              <p className="text-sm text-muted">
                Les primes {targetYear} sont importées. Ouvre le rituel pour voir la hausse de chaque contrat et les meilleures offres.
              </p>
              <ActionForm action={openReviewAction} className="mt-3">
                <input type="hidden" name="year" value={targetYear} />
                <SubmitButton className="w-full">Ouvrir le rituel {targetYear}</SubmitButton>
              </ActionForm>
            </>
          ) : stagingNext ? (
            <>
              <p className="text-sm text-muted">Les primes {targetYear} sont importées mais pas encore validées.</p>
              <ButtonLink href={`/reglages/primes/${stagingNext.id}`} className="mt-3 w-full">
                Vérifier et activer les primes {targetYear}
              </ButtonLink>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                L&apos;OFSP publie les primes {targetYear} fin septembre. Importe le fichier officiel pour commencer.
              </p>
              <ButtonLink href="/reglages/primes" className="mt-3 w-full">
                Importer les primes {targetYear}
              </ButtonLink>
            </>
          )}
        </Card>
      )}

      {persons.length > 0 && (
        <Card>
          <CardTitle
            action={
              <span className="num text-sm font-semibold">
                <Chf rp={totalMonthly} />
                /mois
              </span>
            }
          >
            Contrats {coverageYear}
          </CardTitle>
          <ul>
            {policies.map(({ person, policy }) => (
              <ListRow
                key={person.id}
                href={`/foyer/${person.id}`}
                trailing={policy ? <Chf rp={policy.billedMonthlyRp} className="text-sm font-semibold" /> : <Badge>À saisir</Badge>}
              >
                <p className="font-medium">{person.firstName}</p>
                <p className="truncate text-sm text-muted">
                  {policy
                    ? `${ctx.tariffs.insurerName(policy.insurerId)} · ${MODEL_SHORT[policy.modelType as ModelType]} · franchise ${policy.franchiseChf}`
                    : "Aucun contrat saisi"}
                </p>
              </ListRow>
            ))}
          </ul>
          {totalMonthly > 0 && <p className="num mt-2 text-sm text-muted">Soit {formatChf(totalMonthly * 12)} par an.</p>}
        </Card>
      )}

      {!isReviewSeason(today) && h && (
        <Notice title="Prochain rituel">
          Les nouvelles primes sont publiées fin septembre. Rendez-vous début octobre : tu seras notifié dès que les primes {targetYear} seront
          disponibles. Résiliation possible jusqu&apos;au {formatDateFr(`${targetYear - 1}-11-30`)}.
        </Notice>
      )}
    </div>
  );
}
