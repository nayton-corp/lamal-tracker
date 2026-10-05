import { Mailbox, RotateCcw } from "lucide-react";
import { pingenAbandonAction, pingenRefreshAction, pingenSendAction } from "@/app/actions/review";
import { formatDateLong, type IsoDate } from "@/domain/dates";
import { formatChf } from "@/domain/money";
import { PINGEN_PHASE_LABEL, pingenNeedsSync, pingenPhase } from "@/domain/pingen";
import { ActionForm } from "@/ui/action-form";
import { Alert } from "@/ui/alert";
import { ConfirmButton } from "@/ui/confirm-button";
import { SubmitButton } from "@/ui/submit";

/** Proposition d'envoi par Pingen d'une lettre pas encore envoyée. */
export function PingenOffer({ letterId, termination, blockers, sendBy, staging }: { letterId: number; termination: boolean; blockers: string[]; sendBy: IsoDate; staging: boolean }) {
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm">
        <span className="font-medium">Ou sans imprimer :</span> Pingen imprime la lettre avec votre signature à l&apos;écran et la poste en recommandé.
      </p>
      {blockers.length > 0 ? (
        <ul className="list-disc pl-4 text-sm text-muted">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : (
        <ActionForm action={pingenSendAction} hidden={{ letterId }}>
          <ConfirmButton
            size="sm"
            variant="secondary"
            block
            confirmVariant="primary"
            confirmLabel={staging ? "Envoyer (test)" : "Envoyer en recommandé"}
            message="Envoyer cette lettre par Pingen ?"
            details={
              <>
                <p>Pingen imprime la lettre telle quelle, signature à l&apos;écran comprise, et la remet à la Poste en recommandé dès le jour ouvrable suivant. L&apos;envoi est facturé sur votre compte Pingen.</p>
                {termination && (
                  <p>
                    Une signature imprimée n&apos;est pas une signature manuscrite (art. 14 CO). Les caisses l&apos;acceptent en général, mais pour une sécurité totale, signez à la main. Envoyez tôt : si la caisse la refusait, il resterait du temps avant le {formatDateLong(sendBy, true)}.
                  </p>
                )}
                {staging && <p>Environnement de test Pingen : rien ne sera posté.</p>}
              </>
            }
          >
            <Mailbox aria-hidden className="size-4" /> Envoyer en recommandé via Pingen
          </ConfirmButton>
        </ActionForm>
      )}
    </div>
  );
}

/** Suivi d'une lettre confiée à Pingen. */
export function PingenTracking({ letterId, status, priceRp, checkedAt }: { letterId: number; status: string; priceRp: number | null; checkedAt: string | null }) {
  const phase = pingenPhase(status);
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <span className="font-medium">Pingen :</span> {PINGEN_PHASE_LABEL[phase]}
        {priceRp !== null && <span className="text-muted"> · {formatChf(priceRp)}</span>}
        {checkedAt && <span className="text-muted"> · vérifié le {formatDateLong(checkedAt.slice(0, 10))}</span>}
      </p>
      {phase === "FAILED" && (
        <Alert tone="danger" title="Pingen n'a pas envoyé cette lettre">
          Statut « {status} ». Le détail est sur app.pingen.com. Reprenez la lettre pour l&apos;envoyer vous-même ou la confier à nouveau à Pingen.
        </Alert>
      )}
      {phase === "UNCONFIRMED" && (
        <Alert tone="info" title="Envoi pas encore confirmé">
          Pingen n&apos;a pas répondu à la demande : la lettre est peut-être partie. Actualisez le suivi, ou vérifiez sur app.pingen.com avant de l&apos;envoyer autrement.
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {pingenNeedsSync(status) && (
          <ActionForm action={pingenRefreshAction} hidden={{ letterId }}>
            <SubmitButton size="sm" variant="secondary" pendingLabel="Vérification…">
              Actualiser le suivi
            </SubmitButton>
          </ActionForm>
        )}
        {(phase === "FAILED" || phase === "UNCONFIRMED") && (
          <ActionForm action={pingenAbandonAction} hidden={{ letterId }}>
            <ConfirmButton
              size="sm"
              variant="ghost"
              confirmVariant="primary"
              confirmLabel="Reprendre la lettre"
              message="Reprendre cette lettre ?"
              details={
                phase === "UNCONFIRMED" ? (
                  <p>Vérifiez d&apos;abord sur app.pingen.com qu&apos;elle n&apos;y figure pas : sinon elle partirait deux fois.</p>
                ) : (
                  <p>Elle redevient « à envoyer » : imprimez-la, ou confiez-la à nouveau à Pingen.</p>
                )
              }
            >
              <RotateCcw aria-hidden className="size-4" /> Reprendre la lettre
            </ConfirmButton>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
