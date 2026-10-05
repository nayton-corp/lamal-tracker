import { Check, FileText, Send, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { deleteSignatureAction } from "@/app/actions/journey";
import { listSignatures } from "@/application/signatures";
import { deleteLetterAction, deleteOfferAction, lcaWishesAction, letterSentAction, offerSentAction, prepareAllAction } from "@/app/actions/review";
import { lcaWishesFor, listOfferRequests } from "@/application/offers";
import { getReviewByYear, getReviewView } from "@/application/review";
import { isMinorOn } from "@/domain/age";
import { LCA_GUARANTEES } from "@/domain/lca";
import { formatDateLong, formatDateShort } from "@/domain/dates";
import { displayTariffLabel, type ModelType } from "@/domain/lamal";
import type { LetterContent } from "@/domain/letter";
import { pingenFailed } from "@/domain/pingen";
import { db, today } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { ConfirmButton } from "@/ui/confirm-button";
import { Checkbox, Input } from "@/ui/form";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";
import { pingenReadiness } from "@/application/pingen";
import { pingenClientFor } from "@/server/pingen";
import { PingenOffer, PingenTracking } from "./pingen-panel";
import { PostingGuide } from "./posting-guide";
import { ShareButton } from "./share-button";
import { SignaturePad } from "./signature-pad";
import { pageScope } from "@/server/auth";

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

/** Rappel sous une résiliation : seule l'assurance de base est résiliée, les complémentaires continuent. */
function LcaNote({ lines, insurer }: { lines: { person: { firstName: string }; lcaProducts: string[] }[]; insurer: string }) {
  const products = lines.flatMap((p) => p.lcaProducts.map((x) => (lines.length > 1 ? `${p.person.firstName} : ${x}` : x)));
  return (
    <div className="flex gap-2 rounded-lg bg-lca-soft p-2 text-sm text-lca">
      <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Cette lettre ne résilie que l&apos;assurance de base chez {insurer}. Les complémentaires continuent.</p>
        {products.length > 0 && <p className="text-foreground/80">{products.join(" · ")}</p>}
      </div>
    </div>
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

export default async function LettersPage({ params }: { params: Promise<{ year: string }> }) {
  const scope = await pageScope();
  const year = Number((await params).year);
  const reviewRow = getReviewByYear(db(), scope, year);
  if (!reviewRow) redirect(`/rituel/${year}`);
  const view = getReviewView(db(), scope, reviewRow.id, today());
  const switching = view.lines.filter((p) => p.line.decision === "SWITCH");
  const adjusting = view.lines.filter((p) => p.line.decision === "ADJUST");
  const keeping = view.lines.filter((p) => p.line.decision === "KEEP");
  const undecided = view.lines.filter((p) => p.line.decision === "UNDECIDED");
  // Aucune décision prise : les démarches n'ont pas encore de sens.
  if (undecided.length === view.lines.length) redirect(`/rituel/${year}`);
  const offers = listOfferRequests(db(), scope, reviewRow.id);
  const terminations = view.letters.filter((l) => l.kind === "TERMINATION");
  const changes = view.letters.filter((l) => l.kind === "CHANGE");
  const warnings = [...switching, ...adjusting].flatMap((p) => p.letterCheck.warnings.filter((w) => w.code !== "AFFILIATION_FIRST").map((w) => `${p.person.firstName} : ${w.text}`));
  const lineById = new Map(view.lines.map((p) => [p.line.id, p]));
  const closed = view.review.status === "CLOSED";
  const nothing = switching.length === 0 && adjusting.length === 0;

  const requestsDone = switching.length > 0 && switching.every((p) => p.line.affiliationRequestedAt);
  // Une lettre refusée par Pingen reste à reprendre : elle ne compte pas comme envoyée.
  const failedAtPingen = (l: { pingenStatus: string | null }) => pingenFailed(l.pingenStatus);
  const lettersDone =
    [...switching, ...adjusting].length > 0 && [...terminations, ...changes].length > 0 && [...terminations, ...changes].every((l) => l.sentAt && !failedAtPingen(l));
  const involved = new Set([...switching, ...adjusting].map((p) => p.person.id));
  // Seules les personnes majeures signent ; les lettres le font aussi (application/letters.ts).
  const signers = listSignatures(db(), scope).filter((s) => involved.has(s.personId) && !isMinorOn(s.birthDate, today()));
  const pingen = pingenClientFor(scope);
  let n = 0;

  return (
    <Page>
      <PageHeader title="Démarches" subtitle="Dans l'ordre." back={`/rituel/${year}`} />

      {closed && (
        <Alert tone="success" title="Tout est envoyé">
          Le rituel {year} est terminé et vos nouveaux contrats sont enregistrés. Gardez les confirmations que les caisses vous enverront.
        </Alert>
      )}

      <Card className="space-y-2">
        <p className="font-medium">Qui change quoi</p>
        <ul className="space-y-1 text-sm">
          {switching.map((p) => (
            <li key={p.line.id}>
              <strong>{p.person.firstName}</strong> quitte {p.currentInsurerName} pour <strong>{p.chosenInsurerName}</strong> : demande à {p.chosenInsurerName}, puis résiliation chez {p.currentInsurerName}.
            </li>
          ))}
          {adjusting.map((p) => (
            <li key={p.line.id}>
              <strong>{p.person.firstName}</strong> reste chez {p.currentInsurerName} avec {displayTariffLabel(p.line.chosenLabel, (p.line.chosenModelType ?? "OTHER") as ModelType)}, franchise {p.line.chosenFranchiseChf} : un courrier de changement.
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
        {!nothing && !closed && (
          <ActionForm action={prepareAllAction} hidden={{ reviewId: reviewRow.id }}>
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
          {switching.map((p) => (
            <details key={p.line.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
              <summary className="min-h-11 cursor-pointer content-center font-medium text-primary">
                Demander aussi des complémentaires{switching.length > 1 ? ` pour ${p.person.firstName}` : ""} à {p.chosenInsurerName}
              </summary>
              <ActionForm action={lcaWishesAction} hidden={{ lineId: p.line.id }} className="mt-2 space-y-2">
                <p className="text-muted">Elles figureront dans la demande. Gardez les actuelles jusqu&apos;à l&apos;acceptation écrite des nouvelles.</p>
                {(() => {
                  const wishes = new Set<string>(lcaWishesFor(db(), p.line));
                  return LCA_GUARANTEES.map((g) => <Checkbox key={g.key} name="wish" value={g.key} defaultChecked={wishes.has(g.key)} label={g.label} />);
                })()}
                <SubmitButton size="sm" variant="secondary">Enregistrer</SubmitButton>
              </ActionForm>
            </details>
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
              Imprimez, signez (chaque adulte ; un parent pour les mineurs) et envoyez en <strong>recommandé</strong> avant le {formatDateLong(view.deadlines.sendBy, true)}
              {pingen ? ", ou confiez l'envoi à Pingen." : "."}
            </>
          }
        >
          {terminations.length + changes.length === 0 && <p className="text-sm text-muted">Préparez les courriers ci-dessus.</p>}
          {terminations.length + changes.length > 0 && !lettersDone && (
            <PostingGuide today={today()} deadlines={view.deadlines} signers={signers.map((s) => s.firstName)} pingen={Boolean(pingen)} />
          )}
          {[...terminations, ...changes].map((l) => {
            const content = l.content as LetterContent;
            return (
              <Card key={l.id} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{l.insurerName}</p>
                    <p className="text-sm text-muted">{content.personRows.map((p) => p.split(",")[0]).join(", ")}</p>
                  </div>
                  <Badge tone={failedAtPingen(l) ? "increase" : l.sentAt ? "saving" : l.kind === "TERMINATION" ? "increase" : "primary"}>
                    {failedAtPingen(l)
                      ? "À reprendre"
                      : l.sentAt
                        ? `${l.pingenStatus ? "Confiée à Pingen" : "Envoyée"} le ${formatDateShort(l.sentAt)}`
                        : l.kind === "TERMINATION"
                          ? "Résiliation LAMal"
                          : "Changement"}
                  </Badge>
                </div>
                {l.kind === "TERMINATION" && <LcaNote lines={l.lineIds.map((id) => lineById.get(id)).filter((p) => p !== undefined)} insurer={l.insurerName} />}
                <PdfButtons url={`/api/letters/${l.id}/pdf`} filename={`lettre-${l.id}.pdf`} primary={!l.sentAt} />
                {l.pingenStatus && <PingenTracking letterId={l.id} status={l.pingenStatus} priceRp={l.pingenPriceRp} checkedAt={l.pingenCheckedAt} />}
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
                {pingen && !l.sentAt && (
                  <PingenOffer letterId={l.id} termination={l.kind === "TERMINATION"} blockers={pingenReadiness(db(), scope, content)} sendBy={view.deadlines.sendBy} staging={pingen.staging} />
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
    </Page>
  );
}
