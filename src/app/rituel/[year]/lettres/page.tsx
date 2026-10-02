import { CheckCircle2, FileText, Mail, Printer, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteLetterAction, deleteOfferAction, generateLettersAction, generateOffersAction, letterAckAction, letterSentAction, offerAnsweredAction, offerSentAction } from "@/app/actions/review";
import { listOfferRequests } from "@/application/offers";
import { getReviewByYear, getReviewView } from "@/application/review";
import { formatDateLong, formatDateShort } from "@/domain/dates";
import type { LetterContent } from "@/domain/letter";
import { db, today } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { ConfirmButton } from "@/ui/confirm-button";
import { Input } from "@/ui/form";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";
import { ShareButton } from "./share-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lettres" };

export default async function LettersPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  const r = getReviewByYear(db(), year);
  if (!r) redirect(`/rituel/${year}`);
  const view = getReviewView(db(), r.id, today());
  const concerned = view.persons.filter((p) => p.line.decision === "SWITCH" || p.line.decision === "ADJUST");
  const switching = view.persons.filter((p) => p.line.decision === "SWITCH");
  const offers = listOfferRequests(db(), r.id);
  const warnings = concerned.flatMap((p) => p.letterCheck.warnings.map((w) => `${p.person.firstName} : ${w}`));

  return (
    <Page>
      <PageHeader title="Lettres" subtitle={`À envoyer en recommandé avant le ${formatDateLong(view.deadlines.sendBy, true)}.`} back={`/rituel/${year}`} />

      <Card className="space-y-3">
        <ol className="space-y-2 text-sm">
          <li className="flex gap-2"><Printer aria-hidden className="size-5 shrink-0 text-primary" /><span>Imprimez la lettre (ou partagez-la vers une imprimante).</span></li>
          <li className="flex gap-2"><FileText aria-hidden className="size-5 shrink-0 text-primary" /><span>Signez : chaque adulte concerné ; un parent pour les mineurs.</span></li>
          <li className="flex gap-2"><Mail aria-hidden className="size-5 shrink-0 text-primary" /><span>Envoyez en <strong>recommandé</strong> : la caisse doit la <strong>recevoir</strong> au plus tard le {formatDateLong(view.deadlines.receiptDeadline)}.</span></li>
        </ol>
        {warnings.length > 0 && (
          <Alert tone="info" title="À vérifier">
            <ul className="list-disc pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}
        <ActionForm action={generateLettersAction} hidden={{ reviewId: r.id }}>
          <SubmitButton block variant={view.letters.length ? "secondary" : "primary"} pendingLabel="Génération…" disabled={concerned.length === 0}>
            {view.letters.length ? "Refaire les lettres pas encore envoyées" : "Générer les lettres"}
          </SubmitButton>
        </ActionForm>
      </Card>

      {switching.length > 0 && (
        <Section title="Demandes aux nouvelles caisses">
          <Card className="space-y-3">
            <p className="text-sm">
              Demandez l&apos;offre et l&apos;affiliation à la nouvelle caisse, par e-mail ou par courrier. L&apos;assurance de base ne peut pas vous être refusée ; les
              complémentaires demandées passent par un questionnaire de santé.{" "}
              <Link href={`/rituel/${year}/lca`} className="text-primary underline">
                Choisir les complémentaires à demander
              </Link>
            </p>
            <ActionForm action={generateOffersAction} hidden={{ reviewId: r.id }}>
              <SubmitButton block variant={offers.length ? "secondary" : "primary"} pendingLabel="Préparation…">
                {offers.length ? "Refaire les demandes pas encore envoyées" : "Préparer les demandes d'offre"}
              </SubmitButton>
            </ActionForm>
          </Card>
          {offers.length > 0 && (
            <ul className="space-y-3">
              {offers.map((o) => {
                const url = `/api/offers/${o.id}/pdf`;
                return (
                  <li key={o.id}>
                    <Card className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{o.insurerName}</p>
                          <p className="text-sm text-muted">{o.content.personRows.map((p) => p.split(",")[0]).join(", ")}</p>
                          {(o.content.extraRows?.length ?? 0) > 0 && <p className="text-sm text-muted">Avec offre de complémentaires</p>}
                        </div>
                        <Badge tone="saving">Demande d&apos;offre</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {o.mailto && (
                          <Button asChild size="sm">
                            <a href={o.mailto}>
                              <Send aria-hidden className="size-4" /> Envoyer par e-mail
                            </a>
                          </Button>
                        )}
                        <Button asChild size="sm" variant={o.mailto ? "secondary" : "primary"}>
                          <a href={url} target="_blank" rel="noopener">
                            <FileText aria-hidden className="size-4" /> Ouvrir le PDF
                          </a>
                        </Button>
                        <ShareButton url={url} filename={`demande-offre-${o.id}.pdf`} />
                        {!o.sentAt && (
                          <form action={deleteOfferAction}>
                            <input type="hidden" name="offerId" value={o.id} />
                            <Button size="sm" variant="ghost" className="text-increase" aria-label="Supprimer la demande">
                              <Trash2 aria-hidden className="size-4" />
                            </Button>
                          </form>
                        )}
                      </div>
                      {o.email && <p className="text-xs text-muted">E-mail de la caisse selon l&apos;annuaire officiel : {o.email}. Beaucoup de caisses proposent aussi un formulaire en ligne{o.website ? ` sur ${o.website.replace(/^https?:\/\//, "")}` : ""}.</p>}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 p-3 text-sm">
                        {o.sentAt ? (
                          <>
                            <span className="flex items-center gap-2 font-medium text-saving">
                              <CheckCircle2 aria-hidden className="size-4 shrink-0" /> Envoyée le {formatDateShort(o.sentAt)}
                            </span>
                            <form action={offerAnsweredAction} className="flex items-center gap-2">
                              <input type="hidden" name="offerId" value={o.id} />
                              {o.answeredAt ? (
                                <>
                                  <span>Réponse reçue le {formatDateShort(o.answeredAt)}</span>
                                  <input type="hidden" name="undo" value="1" />
                                  <Button size="sm" variant="ghost">Annuler</Button>
                                </>
                              ) : (
                                <Button size="sm" variant="secondary">Réponse reçue</Button>
                              )}
                            </form>
                          </>
                        ) : (
                          <form action={offerSentAction} className="w-full">
                            <input type="hidden" name="offerId" value={o.id} />
                            <Button size="sm" variant="secondary" block>
                              Marquer comme envoyée
                            </Button>
                          </form>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      <Section title="Résiliations et changements">
        {view.letters.length === 0 ? (
          <p className="px-1 text-muted">Aucune lettre pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-3">
            {view.letters.map((l) => {
              const content = l.content as LetterContent;
              const url = `/api/letters/${l.id}/pdf`;
              return (
                <li key={l.id}>
                  <Card className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{l.insurerName}</p>
                        <p className="text-sm text-muted">{content.personRows.map((p) => p.split(",")[0]).join(", ")}</p>
                      </div>
                      <Badge tone={l.kind === "TERMINATION" ? "increase" : "primary"}>{l.kind === "TERMINATION" ? "Résiliation LAMal" : "Changement"}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <a href={url} target="_blank" rel="noopener">
                          <FileText aria-hidden className="size-4" /> Ouvrir le PDF
                        </a>
                      </Button>
                      <ShareButton url={url} filename={`lettre-${l.id}.pdf`} />
                      {!l.sentAt && (
                        <form action={deleteLetterAction}>
                          <input type="hidden" name="letterId" value={l.id} />
                          <ConfirmButton size="sm" variant="ghost" className="text-increase" message="Supprimer cette lettre ?" confirmLabel="Supprimer" details={<p>Vous pourrez la préparer à nouveau avec « Générer les lettres ».</p>} aria-label="Supprimer la lettre">
                            <Trash2 aria-hidden className="size-4" />
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                    {l.sentAt ? (
                      <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
                        <p className="flex items-center gap-2 font-medium text-saving">
                          <CheckCircle2 aria-hidden className="size-4 shrink-0" />
                          <span>
                            Envoyée le {formatDateShort(l.sentAt)}
                            {l.trackingNumber && <span className="block font-normal break-all text-muted">Suivi : {l.trackingNumber}</span>}
                          </span>
                        </p>
                        <form action={letterAckAction} className="flex items-center justify-between gap-2">
                          <input type="hidden" name="letterId" value={l.id} />
                          {l.acknowledgedAt ? (
                            <>
                              <span>Confirmation de la caisse reçue le {formatDateShort(l.acknowledgedAt)}</span>
                              <input type="hidden" name="undo" value="1" />
                              <Button size="sm" variant="ghost">Annuler</Button>
                            </>
                          ) : (
                            <>
                              <span className="text-muted">Confirmation de la caisse attendue</span>
                              <Button size="sm" variant="secondary">Reçue</Button>
                            </>
                          )}
                        </form>
                      </div>
                    ) : (
                      <ActionForm action={letterSentAction} hidden={{ letterId: l.id }} className="grid grid-cols-[1fr_1fr] items-end gap-2">
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Envoyée le</span>
                          <Input type="date" name="sentAt" defaultValue={today()} />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">N° de suivi</span>
                          <Input name="tracking" placeholder="98.xx…" autoComplete="off" />
                        </label>
                        <SubmitButton size="sm" variant="secondary" className="col-span-2">
                          Marquer comme envoyée
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </Page>
  );
}
