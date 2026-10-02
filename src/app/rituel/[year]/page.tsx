import type { Metadata } from "next";
import Link from "next/link";
import { closeReviewAction, refreshReviewAction, reopenReviewAction } from "@/app/actions";
import { reviewOverview } from "@/application/review";
import { formatDateFr, formatDateShort } from "@/domain/calendar";
import { formatChf } from "@/domain/money";
import { reviewForYear } from "@/server/review-lookup";
import { ActionForm, SubmitButton } from "@/ui/action-form";
import { Card, CardTitle, Notice, PageHeader } from "@/ui/primitives";
import { PersonCards, RitualActions, RitualHeader } from "@/ui/ritual/overview";

export const metadata: Metadata = { title: "Rituel" };

export default async function RitualPage({ params }: PageProps<"/rituel/[year]">) {
  const { year } = await params;
  const { ctx, review } = reviewForYear(year);
  const overview = reviewOverview(ctx, review.id);
  const dataset = ctx.tariffs.getDataset(review.datasetId);
  const allDecided = overview.lines.every((l) => l.line.decision !== null);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={`Rituel ${review.targetYear}`} subtitle={`Ouvert le ${formatDateShort(review.openedAt.slice(0, 10))}`} back="/" />
      <RitualHeader overview={overview} />
      {review.co2AnnualRp === null ? (
        <Notice>
          Redistribution CO2/COV {review.targetYear} inconnue : la prime nette affichée l&apos;ignore.{" "}
          <Link href={`/reglages/parametres?annee=${review.targetYear}`} className="font-semibold underline">
            La renseigner
          </Link>
        </Notice>
      ) : (
        <p className="text-sm text-muted">
          Redistribution CO2/COV {review.targetYear} : {formatChf(review.co2AnnualRp)} par personne et par an, déduite de la prime nette.
        </p>
      )}
      <PersonCards overview={overview} />
      <RitualActions overview={overview} />
      <Card>
        <CardTitle>Données du rituel</CardTitle>
        <p className="text-sm text-muted">
          Primes OFSP {dataset?.year} ({dataset?.sourceLabel}, importées le {dataset ? formatDateShort(dataset.importedAt.slice(0, 10)) : "?"}).
          Échéance légale : {formatDateFr(review.deadlineDate, true)}.
        </p>
        {review.status !== "CLOSED" && (
          <form action={refreshReviewAction} className="mt-3">
            <input type="hidden" name="reviewId" value={review.id} />
            <button type="submit" className="min-h-11 text-sm font-semibold text-primary hover:underline">
              Recalculer les renouvellements (après modification d&apos;un contrat ou du foyer)
            </button>
          </form>
        )}
      </Card>
      {review.status !== "CLOSED" && (
        <Card>
          <CardTitle>Clôture</CardTitle>
          <p className="mb-3 text-sm text-muted">
            En janvier, clôture le rituel : les contrats {review.targetYear} sont créés à partir de tes décisions et l&apos;historique est figé.
          </p>
          <ActionForm action={closeReviewAction}>
            <input type="hidden" name="reviewId" value={review.id} />
            <SubmitButton variant="secondary" className="w-full">
              {allDecided ? `Clôturer le rituel ${review.targetYear}` : "Clôturer (toutes les décisions sont requises)"}
            </SubmitButton>
          </ActionForm>
        </Card>
      )}
      {review.status === "CLOSED" && (
        <form action={reopenReviewAction} className="text-center">
          <input type="hidden" name="reviewId" value={review.id} />
          <button type="submit" className="min-h-11 text-sm text-muted underline">
            Rouvrir le rituel
          </button>
        </form>
      )}
    </div>
  );
}
