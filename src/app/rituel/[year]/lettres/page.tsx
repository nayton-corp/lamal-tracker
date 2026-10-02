import { ArrowRight, Check, FileText, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { deleteSignatureAction } from "@/app/actions/journey";
import { listSignatures } from "@/application/signatures";
import { deleteLetterAction, deleteOfferAction, letterAckAction, letterSentAction, offerAnsweredAction, offerSentAction, prepareAllAction } from "@/app/actions/review";
import { listOfferRequests } from "@/application/offers";
import { getReviewByYear, getReviewView } from "@/application/review";
import { formatDateLong, formatDateShort } from "@/domain/dates";
import { displayTariffLabel, type ModelType } from "@/domain/lamal";
import type { LetterContent } from "@/domain/letter";
import { db, today } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { ConfirmButton } from "@/ui/confirm-button";
import { Input } from "@/ui/form";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";
import { ShareButton } from "./share-button";
import { SignaturePad } from "./signature-pad";

export const dynamic = "force-dynamic";
export const metadata = { title: "Démarches" };

function Step({ n, title, done, children, hint }: { n: number; title: string; done: boolean; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-labelledby={`etape-${n}`}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", done ? "bg-saving text-white dark:text-black" : "bg-primary text-on-primary")} aria-hidden>
          {done ? <Check className="size-4" /> : n}
        </span>
        <div>
          <h2 id={`etape-${n}`} className="text-lg font-semibold">
            {title}
            <span className="sr-only">{done ? " : fait" : " : à faire"}</span>
          </h2>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
      </div>
      <div className="space-y-3 sm:pl-11">{children}</div>
    </section>
  );
}

function PdfButtons({ url, filename, mailto, primary }: { url: string; filename: string; mailto?: string | null; primary?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {mailto && (
        <Button asChild size="sm">
          <a href={mailto}>
            <Send aria-hidden className="size-4" /> Envoyer par e-mail
          </a>
        </Button>
      )}
      <Button asChild size="sm" variant={mailto || !primary ? "secondary" : "primary"}>
        <a href={url} target="_blank" rel="noopener">
          <FileText aria-hidden className="size-4" /> Ouvrir le PDF
        </a>
      </Button>
      <ShareButton url={url} filename={filename} />
    </div>
  );
}

export default async function ProceduresPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  const r = getReviewByYear(db(), year);
  if (!r) redirect(`/rituel/${year}`);
  const view = getReviewView(db(), r.id, today());
  const switching = view.persons.filter((p) => p.line.decision === "SWITCH");
  const adjusting = view.persons.filter((p) => p.line.decision === "ADJUST");
  const keeping = view.persons.filter((p) => p.line.decision === "KEEP");
  const undecided = view.persons.filter((p) => p.line.decision === "UNDECIDED");
  // Aucune décision prise : les démarches n'ont pas encore de sens.
  if (undecided.length === view.persons.length) redirect(`/rituel/${year}`);
  const offers = listOfferRequests(db(), r.id);
  const terminations = view.letters.filter((l) => l.kind === "TERMINATION");
  const changes = view.letters.filter((l) => l.kind === "CHANGE");
  const warnings = [...switching, ...adjusting].flatMap((p) => p.letterCheck.warnings.filter((w) => !/Demandez d'abord/.test(w)).map((w) => `${p.person.firstName} : ${w}`));
  const lcaPending = switching.filter((p) => !p.line.lcaAckAt);
  const nothing = switching.length === 0 && adjusting.length === 0;

  const requestsDone = switching.length > 0 && switching.every((p) => p.line.affiliationRequestedAt);
  const lettersDone = [...switching, ...adjusting].length > 0 && [...terminations, ...changes].length > 0 && [...terminations, ...changes].every((l) => l.sentAt);
  const confirmDone = offers.every((o) => o.answeredAt) && terminations.every((l) => l.acknowledgedAt) && offers.length + terminations.length > 0;
  const involved = new Set([...switching, ...adjusting].map((p) => p.person.id));
  const signers = listSignatures(db()).filter((s) => involved.has(s.personId) && year - 1 - Number(s.birthDate.slice(0, 4)) >= 18);
  let n = 0;

  return (
    <Page>
      <PageHeader title="Démarches" subtitle="Dans l'ordre." back={`/rituel/${year}`} />

      <Card className="space-y-2">
        <p className="font-medium">Qui change quoi</p>
        <ul className="space-y-1 text-sm">
          {switching.map((p) => (
            <li key={p.line.id}>
              <strong>{p.person.firstName}</strong> quitte {p.currentInsurer} pour <strong>{p.chosenInsurer}</strong> : demande à {p.chosenInsurer}, puis résiliation chez {p.currentInsurer}.
            </li>
          ))}
          {adjusting.map((p) => (
            <li key={p.line.id}>
              <strong>{p.person.firstName}</strong> reste chez {p.currentInsurer} avec {displayTariffLabel(p.line.chosenLabel, (p.line.chosenModelType ?? "OTHER") as ModelType)}, franchise {p.line.chosenFranchiseChf} : un courrier de changement.
            </li>
          ))}
          {keeping.map((p) => (
            <li key={p.line.id} className="text-muted">
              {p.person.firstName} garde son contrat : rien à envoyer.
            </li>
          ))}
          {undecided.map((p) => (
            <li key={p.line.id}>
              {p.person.firstName} : <Link className="text-primary underline" href={`/rituel/${year}/personne/${p.line.id}`}>choix à faire</Link>
            </li>
          ))}
        </ul>
        {lcaPending.length > 0 && (
          <Alert tone="lca" title="Complémentaires à contrôler d'abord">
            {lcaPending.map((p) => p.person.firstName).join(", ")} : <Link className="underline" href={`/rituel/${year}/lca`}>vérifiez les complémentaires</Link> avant de résilier.
          </Alert>
        )}
        {!nothing && (
          <ActionForm action={prepareAllAction} hidden={{ reviewId: r.id }}>
            <SubmitButton block variant={offers.length + view.letters.length ? "secondary" : "primary"} pendingLabel="Préparation…">
              {offers.length + view.letters.length ? "Mettre à jour les courriers pas encore envoyés" : "Préparer tous les courriers"}
            </SubmitButton>
          </ActionForm>
        )}
        {warnings.length > 0 && (
          <Alert tone="info" title="À vérifier">
            <ul className="list-disc pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}
      </Card>

      {signers.length > 0 && (
        <Card className="space-y-3">
          <div>
            <p className="font-medium">Signature électronique</p>
            <p className="text-sm text-muted">
              Signez une fois : la signature figure sur chaque courrier PDF.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {signers.map((s) => (
              <li key={s.personId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-3">
                  {s.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.dataUrl} alt={`Signature de ${s.firstName}`} className="h-10 w-28 rounded border border-border bg-white object-contain" />
                  ) : (
                    <span className="flex h-10 w-28 items-center justify-center rounded border border-dashed border-border text-xs text-muted">non signé</span>
                  )}
                  <span className="font-medium">
                    {s.firstName} {s.lastName}
                  </span>
                </span>
                <span className="flex gap-1">
                  <SignaturePad personId={s.personId} name={s.firstName} signed={Boolean(s.dataUrl)} />
                  {s.dataUrl && (
                    <form action={deleteSignatureAction}>
                      <input type="hidden" name="personId" value={s.personId} />
                      <Button size="icon" variant="ghost" className="text-increase" aria-label={`Retirer la signature de ${s.firstName}`}>
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Pour la résiliation, le recommandé signé à la main reste le plus sûr (art. 14 CO).
          </p>
        </Card>
      )}

      {nothing && (
        <Alert tone="success" title="Rien à envoyer">
          Personne ne change de caisse, de franchise ou de modèle.
        </Alert>
      )}

      {switching.length > 0 && (
        <Step
          n={++n}
          title="Souscrire auprès de la nouvelle caisse"
          done={requestsDone}
          hint="Demande pré-remplie. La caisse doit vous accepter pour la base ; les complémentaires passent par un questionnaire."
        >
          {offers.length === 0 && <p className="text-sm text-muted">Préparez les courriers ci-dessus.</p>}
          {offers.map((o) => (
            <Card key={o.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{o.insurerName}</p>
                  <p className="text-sm text-muted">
                    {o.content.personRows.map((p) => p.split(",")[0]).join(", ")}
                    {(o.content.extraRows?.length ?? 0) > 0 && " · avec offre de complémentaires"}
                  </p>
                </div>
                <Badge tone={o.sentAt ? "saving" : "neutral"}>{o.sentAt ? `Envoyée le ${formatDateShort(o.sentAt)}` : "À envoyer"}</Badge>
              </div>
              <PdfButtons url={`/api/offers/${o.id}/pdf`} filename={`demande-offre-${o.id}.pdf`} mailto={o.mailto} primary />
              {o.email && <p className="text-xs text-muted">Adresse de la caisse (annuaire officiel) : {o.email}{o.website ? ` · formulaire en ligne possible sur ${o.website.replace(/^https?:\/\//, "")}` : ""}.</p>}
              <div className="flex gap-2">
                <form action={offerSentAction} className="flex-1">
                  <input type="hidden" name="offerId" value={o.id} />
                  {o.sentAt && <input type="hidden" name="undo" value="1" />}
                  <Button size="sm" variant={o.sentAt ? "ghost" : "secondary"} block>
                    {o.sentAt ? "Annuler l'envoi" : "Marquer comme envoyée"}
                  </Button>
                </form>
                {!o.sentAt && (
                  <form action={deleteOfferAction}>
                    <input type="hidden" name="offerId" value={o.id} />
                    <Button size="sm" variant="ghost" className="text-increase" aria-label="Supprimer la demande">
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
        </Step>
      )}

      {(switching.length > 0 || adjusting.length > 0) && (
        <Step
          n={++n}
          title={switching.length ? "Résilier chez la caisse actuelle" : "Annoncer le changement à votre caisse"}
          done={lettersDone}
          hint={
            <>
              Imprimez, signez (chaque adulte ; un parent pour les mineurs) et envoyez en <strong>recommandé</strong> avant le {formatDateLong(view.deadlines.sendBy, true)}.
            </>
          }
        >
          {terminations.length + changes.length === 0 && <p className="text-sm text-muted">Préparez les courriers ci-dessus.</p>}
          {[...terminations, ...changes].map((l) => {
            const content = l.content as LetterContent;
            return (
              <Card key={l.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{l.insurerName}</p>
                    <p className="text-sm text-muted">{content.personRows.map((p) => p.split(",")[0]).join(", ")}</p>
                  </div>
                  <Badge tone={l.sentAt ? "saving" : l.kind === "TERMINATION" ? "increase" : "primary"}>
                    {l.sentAt ? `Envoyée le ${formatDateShort(l.sentAt)}` : l.kind === "TERMINATION" ? "Résiliation LAMal" : "Changement"}
                  </Badge>
                </div>
                <PdfButtons url={`/api/letters/${l.id}/pdf`} filename={`lettre-${l.id}.pdf`} primary={!l.sentAt} />
                {l.sentAt ? (
                  l.trackingNumber && (
                    <p className="text-sm break-all text-muted">
                      Suivi : {l.trackingNumber}{" "}
                      <a className="text-primary underline" href={`https://service.post.ch/ekp-web/ui/entry/search/${encodeURIComponent(l.trackingNumber.replace(/\s/g, ""))}`} target="_blank" rel="noopener">
                        Suivre l&apos;envoi
                      </a>
                    </p>
                  )
                ) : (
                  <ActionForm action={letterSentAction} hidden={{ letterId: l.id }} className="grid grid-cols-2 items-end gap-2">
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
                {!l.sentAt && (
                  <form action={deleteLetterAction}>
                    <input type="hidden" name="letterId" value={l.id} />
                    <ConfirmButton size="sm" variant="ghost" block className="text-increase" message="Supprimer cette lettre ?" confirmLabel="Supprimer" details={<p>Vous pourrez la préparer à nouveau.</p>}>
                      <Trash2 aria-hidden className="size-4" /> Supprimer la lettre
                    </ConfirmButton>
                  </form>
                )}
              </Card>
            );
          })}
        </Step>
      )}

      {offers.length + terminations.length > 0 && (
        <Step n={++n} title="Recevoir les confirmations" done={confirmDone} hint="Gardez-les : la nouvelle caisse confirme l'affiliation, l'ancienne la fin du contrat au 31 décembre.">
          <Card className="divide-y divide-border p-0">
            {offers.map((o) => (
              <form key={`o${o.id}`} action={offerAnsweredAction} className="flex items-center justify-between gap-2 p-3 text-sm">
                <input type="hidden" name="offerId" value={o.id} />
                <span>
                  <span className="block font-medium">{o.insurerName} : affiliation</span>
                  <span className="text-muted">{o.answeredAt ? `Reçue le ${formatDateShort(o.answeredAt)}` : o.sentAt ? "Attendue" : "Après l'envoi de la demande"}</span>
                </span>
                {o.answeredAt && <input type="hidden" name="undo" value="1" />}
                <Button size="sm" variant={o.answeredAt ? "ghost" : "secondary"} disabled={!o.sentAt}>
                  {o.answeredAt ? "Annuler" : "Reçue"}
                </Button>
              </form>
            ))}
            {terminations.map((l) => (
              <form key={`l${l.id}`} action={letterAckAction} className="flex items-center justify-between gap-2 p-3 text-sm">
                <input type="hidden" name="letterId" value={l.id} />
                <span>
                  <span className="block font-medium">{l.insurerName} : fin du contrat</span>
                  <span className="text-muted">{l.acknowledgedAt ? `Reçue le ${formatDateShort(l.acknowledgedAt)}` : l.sentAt ? "Attendue" : "Après l'envoi de la résiliation"}</span>
                </span>
                {l.acknowledgedAt && <input type="hidden" name="undo" value="1" />}
                <Button size="sm" variant={l.acknowledgedAt ? "ghost" : "secondary"} disabled={!l.sentAt}>
                  {l.acknowledgedAt ? "Annuler" : "Reçue"}
                </Button>
              </form>
            ))}
          </Card>
          {confirmDone && (
            <Button asChild block>
              <Link href={`/rituel/${year}`}>
                Clôturer le rituel <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          )}
        </Step>
      )}
    </Page>
  );
}
