import { notFound } from "next/navigation";
import { setAccountDisabledAction, revokeSignupInviteAction, setPingenAction } from "@/app/actions/admin";
import { markFeedbackAction } from "@/app/actions/feedback";
import { FEEDBACK_KINDS, listFeedback } from "@/application/feedback";
import { usageSummary } from "@/application/usage";
import { Button } from "@/ui/button";
import { listAccounts } from "@/application/admin";
import { listSignupInvitations } from "@/application/invitations";
import { mailDeps } from "@/server/accounts";
import { pingenClient } from "@/server/pingen";
import { pageScope } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { Alert } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Card, Section } from "@/ui/card";
import { ConfirmButton } from "@/ui/confirm-button";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";
import { SignupInviteForm } from "./signup-invite";
import { formatTimestamp } from "@/domain/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration" };


/**
 * Administration de l'instance : chiffres d'usage, invitations, comptes, avis, Pingen par foyer.
 * Aucune donnée de foyer n'y apparaît (ni personnes, ni contrats, ni montants).
 */
export default async function AdminPage() {
  const scope = await pageScope();
  if (!scope.isAdmin) notFound();
  const now = nowIso();
  const accounts = listAccounts(db(), scope);
  const invitations = listSignupInvitations(db(), scope);
  const mail = mailDeps() !== null;
  const pingen = pingenClient() !== null;
  const usage = usageSummary(db(), scope);
  const feedback = listFeedback(db(), scope);
  const unread = feedback.filter((f) => !f.read).length;

  return (
    <Page wide>
      <PageHeader title="Administration" back="/donnees" subtitle="Comptes et invitations. Le contenu des foyers n'apparaît jamais ici." />
      {!mail && (
        <Alert tone="info" title="Courriels non configurés">
          Sans SMTP_URL et APP_URL, les inscrits ne confirment pas leur adresse et ne peuvent pas réinitialiser leur mot de passe eux-mêmes. Voir le README.
        </Alert>
      )}

      <Section title="En chiffres">
        <Card className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Comptes ouverts" value={usage.accountsActive} />
            <Stat label="Comptes créés en tout" value={usage.accountsCreated} />
            <Stat label="Foyers" value={usage.households} />
            <Stat label="Courriers envoyés en tout" value={usage.lettersSent} />
          </dl>
          {usage.years.length > 0 && (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Bilans par année</caption>
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-1 font-medium">Année</th>
                  <th scope="col" className="py-1 font-medium">Bilans</th>
                  <th scope="col" className="py-1 font-medium">Clôturés</th>
                  <th scope="col" className="py-1 font-medium">Courriers préparés</th>
                  <th scope="col" className="py-1 font-medium">Envoyés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usage.years.map((y) => (
                  <tr key={y.year}>
                    <th scope="row" className="py-1.5 font-medium">{y.year}</th>
                    <td>{y.reviews}</td>
                    <td>{y.closed}</td>
                    <td>{y.letters}</td>
                    <td>{y.lettersSent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted">Des totaux seulement : rien ne permet de suivre un compte. Les bilans et courriers comptent les foyers encore présents ; les cumuls survivent aux suppressions.</p>
        </Card>
      </Section>

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        <Section title="Inviter un foyer">
          <Card className="space-y-4">
            <SignupInviteForm />
            {invitations.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {invitations.map((i) => {
                  const active = !i.revokedAt && i.expiresAt > now && i.uses < i.maxUses;
                  return (
                    <li key={i.id} className="flex min-h-12 items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{i.label || "Invitation"}</span>
                        <span className="text-muted">
                          {i.uses}/{i.maxUses} utilisée{i.uses > 1 ? "s" : ""} · {i.revokedAt ? "révoquée" : i.expiresAt <= now ? "expirée" : `jusqu'au ${formatTimestamp(i.expiresAt, "date")}`}
                        </span>
                      </span>
                      {active && (
                        <ActionForm action={revokeSignupInviteAction} hidden={{ id: i.id }}>
                          <SubmitButton variant="ghost" size="sm" pendingLabel="…">Révoquer</SubmitButton>
                        </ActionForm>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </Section>

        <Section title={`Comptes (${accounts.length})`}>
          <ul className="space-y-3">
            {accounts.map((a) => (
              <li key={a.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 break-all font-medium">{a.email ?? "Administrateur (sans courriel)"}</span>
                    {a.admin && <Badge tone="primary">admin</Badge>}
                    {a.disabled && <Badge tone="increase">suspendu</Badge>}
                  </div>
                  <p className="text-sm text-muted">
                    Créé le {formatTimestamp(a.createdAt, "date")}
                    {a.lastSeenAt ? ` · vu le ${formatTimestamp(a.lastSeenAt, "date")}` : ""}
                    {" · "}
                    {a.emailVerified ? "courriel confirmé" : "courriel non confirmé"}
                    {" · "}
                    {a.totp || a.passkeys > 0 ? [a.totp && "double facteur", a.passkeys > 0 && `${a.passkeys} passkey${a.passkeys > 1 ? "s" : ""}`].filter(Boolean).join(", ") : "mot de passe seul"}
                    {" · "}
                    {a.householdId === null ? "sans foyer" : a.householdRole === "OWNER" ? `propriétaire du foyer n° ${a.householdId}` : `membre du foyer n° ${a.householdId}`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {pingen && a.householdRole === "OWNER" && a.householdId !== null && (
                      <ActionForm action={setPingenAction} hidden={{ householdId: a.householdId, allowed: String(!a.pingen) }}>
                        <SubmitButton variant={a.pingen ? "secondary" : "ghost"} size="sm" pendingLabel="…">
                          {a.pingen ? "Retirer l'envoi Pingen" : "Autoriser l'envoi Pingen"}
                        </SubmitButton>
                      </ActionForm>
                    )}
                    {a.id !== scope.userId && (
                      <ActionForm action={setAccountDisabledAction} hidden={{ userId: a.id, disabled: String(!a.disabled) }}>
                        {a.disabled ? (
                          <SubmitButton variant="secondary" size="sm" pendingLabel="…">Réactiver</SubmitButton>
                        ) : (
                          <ConfirmButton variant="ghost" size="sm" message="Suspendre ce compte ?" details={<p>Ses appareils sont déconnectés et il ne peut plus se connecter. Ses données restent.</p>} confirmLabel="Suspendre">
                            Suspendre
                          </ConfirmButton>
                        )}
                      </ActionForm>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title={unread ? `Avis reçus (${unread} non lu${unread > 1 ? "s" : ""})` : "Avis reçus"}>
        <div id="avis" className="scroll-mt-4">
          {feedback.length === 0 ? (
            <p className="rounded-xl bg-surface p-3 text-sm text-muted shadow-card">Aucun avis pour le moment.</p>
          ) : (
            <ul className="space-y-3">
              {feedback.map((f) => (
                <li key={f.id}>
                  <Card className={f.read ? "space-y-2 opacity-75" : "space-y-2 border-primary/40"}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={f.kind === "PROBLEM" ? "increase" : f.kind === "IDEA" ? "primary" : "neutral"}>{FEEDBACK_KINDS[f.kind]}</Badge>
                      <span className="text-muted">
                        {formatTimestamp(f.createdAt, "date")} · {f.email ?? "compte sans courriel"}
                        {f.page ? ` · depuis ${f.page}` : ""}
                      </span>
                    </div>
                    <p className="whitespace-pre-line break-words">{f.message}</p>
                    <form action={markFeedbackAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={f.id} />
                      <Button name="action" value={f.read ? "unread" : "read"} variant="secondary" size="sm">
                        {f.read ? "Marquer non lu" : "Marquer lu"}
                      </Button>
                      {f.email && (
                        <Button asChild variant="ghost" size="sm">
                          <a href={`mailto:${f.email}?subject=${encodeURIComponent("Votre avis sur Primes LAMal")}`}>Répondre</a>
                        </Button>
                      )}
                      <Button name="action" value="delete" variant="ghost" size="sm" className="text-increase">
                        Supprimer
                      </Button>
                    </form>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-2xl font-bold">{value}</dd>
    </div>
  );
}
