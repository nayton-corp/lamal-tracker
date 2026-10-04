import { notFound } from "next/navigation";
import { setAccountDisabledAction, revokeSignupInviteAction, setPingenAction } from "@/app/actions/admin";
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

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration" };

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich", day: "numeric", month: "short", year: "numeric" });

/**
 * Administration de l'instance : invitations, comptes, Pingen par foyer. Aucune donnée de foyer
 * n'y apparaît (ni personnes, ni contrats, ni montants).
 */
export default async function AdminPage() {
  const scope = await pageScope();
  if (!scope.admin) notFound();
  const now = nowIso();
  const accounts = listAccounts(db(), scope);
  const invitations = listSignupInvitations(db(), scope);
  const mail = mailDeps() !== null;
  const pingen = pingenClient() !== null;

  return (
    <Page wide>
      <PageHeader title="Administration" back="/donnees" subtitle="Comptes et invitations. Le contenu des foyers n'apparaît jamais ici." />
      {!mail && (
        <Alert tone="info" title="Courriels non configurés">
          Sans SMTP_URL et APP_URL, les inscrits ne confirment pas leur adresse et ne peuvent pas réinitialiser leur mot de passe eux-mêmes. Voir le README.
        </Alert>
      )}

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
                          {i.uses}/{i.maxUses} utilisée{i.uses > 1 ? "s" : ""} · {i.revokedAt ? "révoquée" : i.expiresAt <= now ? "expirée" : `jusqu'au ${dateFmt(i.expiresAt)}`}
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
                    Créé le {dateFmt(a.createdAt)}
                    {a.lastSeenAt ? ` · vu le ${dateFmt(a.lastSeenAt)}` : ""}
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
    </Page>
  );
}
