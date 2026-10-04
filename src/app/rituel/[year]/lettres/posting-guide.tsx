import { ClipboardCheck } from "lucide-react";
import { daysBetween, formatDateLong, type IsoDate } from "@/domain/dates";
import type { ReviewDeadlines } from "@/domain/deadlines";
import { cn } from "@/ui/cn";

/**
 * Envoi papier pas à pas : date limite avec la marge de la Poste, puis ce qu'il faut pour que
 * le courrier soit valable et prouvable.
 */
export function PostingGuide({ today, deadlines, signers, pingen }: { today: IsoDate; deadlines: ReviewDeadlines; signers: string[]; pingen: boolean }) {
  const left = daysBetween(today, deadlines.sendBy);
  const late = left < 0;
  return (
    <details open={left <= 14} className="group rounded-2xl border border-border bg-surface shadow-card">
      <summary className="flex min-h-12 cursor-pointer items-center gap-3 p-4 font-medium">
        <ClipboardCheck aria-hidden className="size-5 shrink-0 text-primary" />
        <span className="flex-1">Comment envoyer en recommandé</span>
        <span className="text-sm text-muted group-open:hidden">Afficher</span>
      </summary>
      <div className="space-y-3 px-4 pb-4 text-sm">
        <p className={cn("rounded-xl p-3", late ? "bg-increase-soft text-increase" : "bg-primary-soft")}>
          {late ? (
            <>
              La date conseillée ({formatDateLong(deadlines.sendBy)}) est passée. Postez dès aujourd&apos;hui : la caisse doit recevoir le courrier au plus tard le <strong>{formatDateLong(deadlines.receiptDeadline, true)}</strong>.
            </>
          ) : (
            <>
              À poster au plus tard le <strong>{formatDateLong(deadlines.sendBy, true)}</strong>
              {left === 0 ? " (aujourd'hui)" : left === 1 ? " (demain)" : ` (dans ${left} jours)`}. Seule compte la date de <strong>réception</strong> par la caisse, le {formatDateLong(deadlines.receiptDeadline)} au plus tard : la semaine d&apos;écart couvre l&apos;acheminement et un avis de retrait laissé dans la boîte.
            </>
          )}
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Imprimez</strong> chaque courrier sur sa propre feuille A4. Pas d&apos;imprimante ? Partagez le PDF à un proche, ou imprimez-le dans une bibliothèque ou un magasin de photocopies.
          </li>
          <li>
            <strong>Signez à la main</strong>{signers.length > 0 ? ` : ${signers.join(", ")}` : ""}. Chaque adulte signe pour lui-même ; un parent signe pour les enfants mineurs.
          </li>
          <li>
            <strong>Pliez</strong> la feuille en trois pour que l&apos;adresse de la caisse apparaisse dans la fenêtre d&apos;une enveloppe C5/6 (sinon, recopiez l&apos;adresse du courrier).
          </li>
          <li>
            <strong>Postez en recommandé</strong> (lettre « R ») au guichet d&apos;un office de poste, dans une agence postale ou à un automate My Post 24. Gardez le récépissé.
          </li>
          <li>
            <strong>Notez ici le numéro de suivi</strong> imprimé sur le récépissé : c&apos;est votre preuve, et l&apos;app vous relance si la caisse n&apos;a pas confirmé au bout de trois semaines.
          </li>
        </ol>
        {pingen && <p className="text-muted">Ou confiez l&apos;impression et le recommandé à Pingen, directement depuis chaque courrier.</p>}
      </div>
    </details>
  );
}
