import type { Metadata } from "next";
import Link from "next/link";
import {
  deleteLetterAction,
  generateLetterAction,
  markInsurerAckAction,
  markLetterSentAction,
  saveInsurerAction,
  setAffiliationAction,
} from "@/app/actions";
import { letterGroups } from "@/application/review";
import { formatDateFr, formatDateShort } from "@/domain/calendar";
import { reviewForYear } from "@/server/review-lookup";
import { ActionForm, FormField, SubmitButton } from "@/ui/action-form";
import { Badge, Card, CardTitle, EmptyState, inputClass, Notice, PageHeader } from "@/ui/primitives";
import { ShareLetterButton } from "@/ui/ritual/share-letter";

export const metadata: Metadata = { title: "Lettres de résiliation" };

export default async function LettersPage({ params }: PageProps<"/rituel/[year]/lettres">) {
  const { year } = await params;
  const { ctx, review } = reviewForYear(year);
  const groups = letterGroups(ctx, review.id);
  const today = ctx.clock.today();
  const closed = review.status === "CLOSED";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Lettres de résiliation"
        subtitle={`À envoyer en recommandé avant le ${formatDateFr(review.recommendedSendBy, true)}`}
        back={`/rituel/${review.targetYear}`}
      />
      <Notice title="Dans quel ordre ?">
        <ol className="list-decimal pl-5">
          <li>Demande l&apos;affiliation à la nouvelle caisse (en ligne ou par formulaire).</li>
          <li>Envoie la lettre de résiliation en recommandé à l&apos;ancienne caisse.</li>
          <li>L&apos;ancienne caisse ne te libère que quand la nouvelle lui confirme ton affiliation (art. 7 al. 5 LAMal) : pas de trou de couverture.</li>
        </ol>
      </Notice>

      {groups.length === 0 && (
        <EmptyState title="Aucun changement de caisse">Les lettres apparaissent ici quand tu choisis une offre d&apos;une autre caisse.</EmptyState>
      )}

      {groups.map((g) => (
        <Card key={g.insurerId}>
          <CardTitle
            action={
              g.letter?.insurerAckAt ? (
                <Badge tone="down">Confirmée</Badge>
              ) : g.letter?.sentAt ? (
                <Badge tone="info">Envoyée</Badge>
              ) : g.letter ? (
                <Badge>Générée</Badge>
              ) : (
                <Badge>À générer</Badge>
              )
            }
          >
            {g.insurerName}
          </CardTitle>
          <p className="text-sm text-muted">
            Pour {g.lines.map((l) => l.person.firstName).join(", ")} · police{g.lines.length > 1 ? "s" : ""}{" "}
            {g.lines.map((l) => l.policy?.policyNumber || "?").join(", ")}
          </p>

          {!g.address && !closed && (
            <div className="mt-4 rounded-xl border border-border p-3">
              <p className="mb-2 text-sm font-semibold">Adresse de résiliation de {g.insurerName}</p>
              <p className="mb-3 text-xs text-muted">
                Elle figure sur ta police ou sur le site de la caisse (rubrique « résiliation »). Elle est mémorisée pour les années suivantes.
              </p>
              <ActionForm action={saveInsurerAction}>
                <input type="hidden" name="id" value={g.insurerId} />
                <input type="hidden" name="name" value={g.insurerName} />
                <FormField name="recipientName" label="Destinataire">
                  <input id="recipientName" name="recipientName" defaultValue={g.insurerName} className={inputClass} />
                </FormField>
                <FormField name="addressLines" label="Adresse (une ligne par ligne)">
                  <textarea id="addressLines" name="addressLines" rows={3} placeholder={"Case postale 1234\n1000 Lausanne"} className={`${inputClass} py-2`} />
                </FormField>
                <SubmitButton variant="secondary">Enregistrer l&apos;adresse</SubmitButton>
              </ActionForm>
            </div>
          )}

          {!g.check.ok && (
            <ul className="mt-3 flex flex-col gap-1 rounded-xl bg-up-soft p-3 text-sm text-up">
              {g.check.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          )}
          {g.lines.some((l) => !l.line.lcaAckAt) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {g.lines
                .filter((l) => !l.line.lcaAckAt)
                .map((l) => (
                  <Link key={l.line.id} href={`/rituel/${review.targetYear}/${l.line.id}/lca`} className="inline-flex min-h-11 items-center rounded-xl bg-lca-strong px-3 text-sm font-semibold text-black">
                    Garde-fou LCA de {l.person.firstName}
                  </Link>
                ))}
            </div>
          )}
          {g.lines.some((l) => !l.policy?.policyNumber) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {g.lines
                .filter((l) => !l.policy?.policyNumber)
                .map((l) => (
                  <Link key={l.line.id} href={`/foyer/${l.person.id}/contrat?annee=${l.policy?.coverageYear ?? review.targetYear - 1}`} className="text-sm font-semibold text-primary underline">
                    Ajouter le n° de police de {l.person.firstName}
                  </Link>
                ))}
            </div>
          )}

          {g.check.ok && !g.letter?.sentAt && !closed && (
            <div className="mt-4 flex flex-col gap-2">
              <a
                href={`/api/letters/preview?review=${review.id}&insurer=${g.insurerId}`}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold"
              >
                Aperçu (non enregistré)
              </a>
              <ActionForm action={generateLetterAction}>
                <input type="hidden" name="reviewId" value={review.id} />
                <input type="hidden" name="insurerId" value={g.insurerId} />
                <SubmitButton className="w-full">{g.letter ? "Régénérer la lettre" : "Générer la lettre PDF"}</SubmitButton>
              </ActionForm>
            </div>
          )}

          {g.letter && (
            <div className="mt-4 flex flex-col gap-4 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2">
                <a href={`/api/letters/${g.letter.id}/pdf`} target="_blank" rel="noopener" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg">
                  Ouvrir le PDF
                </a>
                <ShareLetterButton url={`/api/letters/${g.letter.id}/pdf`} fileName={`resiliation-lamal-${g.insurerId}.pdf`} />
              </div>
              <p className="text-xs text-muted">
                Générée le {formatDateShort(g.letter.generatedAt.slice(0, 10))}. Imprime-la, signe-la{g.lines.length > 1 ? " (chaque adulte concerné)" : ""}, puis
                envoie-la en recommandé.
              </p>
              <ActionForm action={markLetterSentAction}>
                <input type="hidden" name="letterId" value={g.letter.id} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField name="sentOn" label="Envoyée le">
                    <input id="sentOn" name="sentOn" type="date" defaultValue={g.letter.sentAt ?? today} className={inputClass} />
                  </FormField>
                  <FormField name="trackingNo" label="N° de recommandé">
                    <input id="trackingNo" name="trackingNo" defaultValue={g.letter.trackingNo ?? ""} placeholder="98.xx…" className={inputClass} />
                  </FormField>
                </div>
                <SubmitButton variant="secondary">{g.letter.sentAt ? "Mettre à jour l'envoi" : "Marquer comme envoyée"}</SubmitButton>
              </ActionForm>
              {g.letter.trackingNo && (
                <a
                  href={`https://service.post.ch/ekp-web/ui/entry/search/${encodeURIComponent(g.letter.trackingNo)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-primary underline"
                >
                  Suivre l&apos;envoi sur post.ch
                </a>
              )}
              {g.letter.sentAt && (
                <ActionForm action={markInsurerAckAction}>
                  <input type="hidden" name="letterId" value={g.letter.id} />
                  <FormField name="ackOn" label={`Confirmation de résiliation reçue de ${g.insurerName}`}>
                    <input id="ackOn" name="ackOn" type="date" defaultValue={g.letter.insurerAckAt ?? ""} className={inputClass} />
                  </FormField>
                  <SubmitButton variant="secondary">Enregistrer</SubmitButton>
                </ActionForm>
              )}
              {!g.letter.sentAt && !closed && (
                <ActionForm action={deleteLetterAction} showSuccess={false}>
                  <input type="hidden" name="letterId" value={g.letter.id} />
                  <SubmitButton variant="ghost" className="text-up">
                    Supprimer la lettre (pour changer d&apos;avis)
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-sm font-semibold">Affiliation à la nouvelle caisse</p>
            {g.lines.map(({ line, person }) => (
              <ActionForm key={line.id} action={setAffiliationAction} className="gap-2 rounded-xl bg-surface-2 p-3">
                <input type="hidden" name="lineId" value={line.id} />
                <p className="text-sm font-medium">
                  {person.firstName} → {line.chosenLabel}
                </p>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="requested" defaultChecked={Boolean(line.affiliationRequestedAt)} className="size-5" />
                  Demande d&apos;affiliation envoyée
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="confirmed" defaultChecked={Boolean(line.affiliationConfirmedAt)} className="size-5" />
                  Nouvelle police reçue
                </label>
                <input name="newPolicyNumber" defaultValue={line.newPolicyNumber ?? ""} placeholder="Nouveau n° de police" className={inputClass} />
                <SubmitButton variant="secondary" className="min-h-11">
                  Enregistrer
                </SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
