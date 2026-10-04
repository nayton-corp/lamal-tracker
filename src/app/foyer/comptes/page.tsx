import { Crown, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { leaveHouseholdAction, removeMemberAction, revokeHouseholdInviteAction } from "@/app/actions/members";
import { householdMembers, listHouseholdInvitations, MAX_HOUSEHOLD_MEMBERS } from "@/application/invitations";
import { pageScope } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { Card, Section } from "@/ui/card";
import { ConfirmButton } from "@/ui/confirm-button";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";
import { InvitePanel } from "./invite-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accès au foyer" };

const dateFmt = (iso: string) => new Date(iso).toLocaleString("fr-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" });

/**
 * Comptes qui partagent le foyer. Le propriétaire invite et retire ; un membre consulte, prépare
 * et signe pour lui, et peut quitter le foyer.
 */
export default async function HouseholdAccessPage() {
  const scope = await pageScope();
  if (scope.householdId === null) redirect("/bienvenue");
  const owner = scope.householdRole === "OWNER";
  const members = householdMembers(db(), scope);
  const invites = owner ? listHouseholdInvitations(db(), scope, nowIso()) : [];
  return (
    <Page>
      <PageHeader title="Accès au foyer" back="/foyer" subtitle="Chaque personne a son propre compte et voit les mêmes contrats." />

      <Section title="Comptes du foyer">
        <Card>
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.userId} className="flex min-h-14 items-center gap-3 py-2">
                {m.role === "OWNER" ? <Crown aria-hidden className="size-5 text-primary" /> : <UserRound aria-hidden className="size-5 text-muted" />}
                <span className="min-w-0 flex-1">
                  <span className="block break-all font-medium">
                    {m.email ?? "Administrateur"}
                    {m.you && <span className="font-normal text-muted"> (vous)</span>}
                  </span>
                  <span className="text-sm text-muted">{m.role === "OWNER" ? "Propriétaire" : "Membre"}</span>
                </span>
                {owner && !m.you && (
                  <ActionForm action={removeMemberAction} hidden={{ userId: m.userId }}>
                    <ConfirmButton variant="ghost" size="sm" message="Retirer l'accès ?" details={<p>Cette personne garde son compte, mais ne verra plus ce foyer.</p>} confirmLabel="Retirer">
                      Retirer
                    </ConfirmButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {owner && (
        <Section title="Inviter">
          <Card className="space-y-4">
            <p className="text-sm text-muted">La personne invitée crée son compte avec le lien, puis arrive directement dans ce foyer. Au plus {MAX_HOUSEHOLD_MEMBERS} comptes par foyer.</p>
            <InvitePanel />
            {invites.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex min-h-11 items-center gap-2 px-3 py-2">
                    <span className="flex-1">Invitation en attente, valable jusqu&apos;au {dateFmt(i.expiresAt)}</span>
                    <ActionForm action={revokeHouseholdInviteAction} hidden={{ id: i.id }}>
                      <SubmitButton variant="ghost" size="sm" pendingLabel="…">Annuler</SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      )}

      {!owner && (
        <Section title="Quitter">
          <Card className="space-y-3">
            <p className="text-sm text-muted">Vous ne verrez plus ce foyer. Vous pourrez ensuite créer le vôtre.</p>
            <ActionForm action={leaveHouseholdAction}>
              <ConfirmButton variant="secondary" size="sm" message="Quitter ce foyer ?" confirmLabel="Quitter">
                Quitter le foyer
              </ConfirmButton>
            </ActionForm>
          </Card>
        </Section>
      )}
    </Page>
  );
}
