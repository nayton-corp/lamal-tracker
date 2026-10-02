import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateShort } from "@/domain/calendar";
import { earliestLcaTermination, LCA_CATEGORY_LABEL, lcaWarningsForSwitch } from "@/domain/lca";
import { formatChf } from "@/domain/money";
import { reviewForYear } from "@/server/review-lookup";
import { LcaGuardConfirm } from "@/ui/ritual/lca-guard";

export const metadata: Metadata = { title: "Garde-fou LCA" };

/**
 * Écran plein qui interrompt le parcours avant toute lettre de résiliation.
 * L'ambre est réservé à cet usage dans toute l'application.
 */
export default async function LcaGuardPage({ params }: PageProps<"/rituel/[year]/[lineId]/lca">) {
  const { year, lineId } = await params;
  const { ctx, review, household } = reviewForYear(year);
  const line = ctx.reviews.line(Number(lineId));
  if (!line || line.reviewId !== review.id) notFound();
  if (line.decision !== "SWITCH") redirect(`/rituel/${review.targetYear}/${line.id}`);
  const person = ctx.household.person(line.personId)!;
  const policy = line.currentPolicyId ? ctx.household.policy(line.currentPolicyId) : undefined;
  const currentInsurer = policy ? ctx.tariffs.insurerName(policy.insurerId) : "ta caisse actuelle";
  const lca = ctx.household.lcaPolicies(household.id).map((l) => ({ ...l }));
  const warnings = policy ? lcaWarningsForSwitch(lca, person.id, policy.insurerId) : [];
  const otherLca = lca.filter((l) => l.personId === person.id && l.status === "ACTIVE" && l.insurerId !== policy?.insurerId);
  const today = ctx.clock.today();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#fbbf24] text-black" role="dialog" aria-modal="true" aria-labelledby="lca-title">
      <div className="pt-safe mx-auto flex min-h-full max-w-xl flex-col gap-5 px-5 pb-10 pt-6">
        <Link href={`/rituel/${review.targetYear}/${line.id}`} className="inline-flex min-h-11 items-center self-start text-sm font-semibold underline">
          ← Revenir sans confirmer
        </Link>
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-black text-3xl font-black text-[#fbbf24]">
            !
          </span>
          <h1 id="lca-title" className="text-2xl font-extrabold leading-tight">
            Stop : tes complémentaires (LCA) ne bougent pas
          </h1>
        </div>
        <p className="text-base leading-relaxed">
          Tu changes l&apos;<strong>assurance de base (LAMal)</strong> de {person.firstName} chez {currentInsurer}. La lettre ne résiliera{" "}
          <strong>que la LAMal</strong>. Les complémentaires sont des contrats privés séparés.
        </p>

        {warnings.length > 0 ? (
          <section className="flex flex-col gap-3" aria-label="Complémentaires concernées">
            <h2 className="text-lg font-bold">
              {warnings.length} complémentaire{warnings.length > 1 ? "s" : ""} chez {currentInsurer}
            </h2>
            {warnings.map(({ policy: p, messages }) => (
              <article key={p.id} className="rounded-2xl border-2 border-black bg-white/85 p-4">
                <p className="font-bold">
                  {p.productName} <span className="font-normal">· {LCA_CATEGORY_LABEL[p.category]}</span>
                </p>
                {p.monthlyPremiumRp !== null && <p className="num text-sm">{formatChf(p.monthlyPremiumRp)} par mois</p>}
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
                  {messages.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                  <li>
                    Résiliation possible au plus tôt pour le {formatDateShort(earliestLcaTermination(p, today))} (selon les conditions générales).
                  </li>
                </ul>
              </article>
            ))}
          </section>
        ) : (
          <div className="rounded-2xl border-2 border-black bg-white/85 p-4 text-sm">
            <p className="font-bold">Aucune complémentaire enregistrée chez {currentInsurer}.</p>
            <p className="mt-1">
              Vérifie ta police : si {person.firstName} a une complémentaire chez {currentInsurer}, elle restera active et ne doit pas être résiliée
              maintenant.{" "}
              <Link href={`/foyer/${person.id}/lca/nouvelle`} className="font-semibold underline">
                L&apos;ajouter
              </Link>
            </p>
          </div>
        )}

        {otherLca.length > 0 && (
          <p className="text-sm">
            Autres complémentaires de {person.firstName} (non concernées) : {otherLca.map((l) => l.productName).join(", ")}.
          </p>
        )}

        <div className="rounded-2xl bg-black/10 p-4 text-sm leading-relaxed">
          <p className="font-bold">Règles d&apos;or</p>
          <ol className="mt-1 list-decimal pl-5">
            <li>Ne résilie jamais une LCA avant d&apos;être accepté ailleurs (questionnaire de santé, réserves possibles).</li>
            <li>Garder la LCA chez l&apos;ancienne caisse est permis : LAMal et LCA peuvent être chez des assureurs différents.</li>
            <li>Un rabais « LAMal + LCA chez nous » peut disparaître : la prime LCA peut augmenter.</li>
          </ol>
        </div>

        <LcaGuardConfirm lineId={line.id} year={review.targetYear} />
      </div>
    </div>
  );
}
