import { ChevronRight, FolderLock, History } from "lucide-react";
import Link from "next/link";
import { accountOverview } from "@/application/account";
import { recentAudit } from "@/application/audit";
import { adminNeedsFactor, listSessions } from "@/application/auth";
import { accountPageScope } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { Alert } from "@/ui/alert";
import { Card, Section } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { EmailPanel, PasskeysPanel, PasswordPanel, SessionsPanel, TotpPanel } from "./panels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon compte" };

export default async function AccountPage() {
  const scope = await accountPageScope();
  const account = accountOverview(db(), scope.userId);
  const mustProtect = adminNeedsFactor(db(), scope.userId);
  const events = recentAudit(db(), scope.userId, 15);
  return (
    <Page wide>
      <PageHeader title="Mon compte" subtitle="Connexion, protection du compte et appareils." back={mustProtect ? undefined : "/donnees"} />
      {mustProtect && (
        <Alert tone="danger" title="Protégez votre compte administrateur">
          Ajoutez une passkey ou activez le double facteur avant de continuer : ce compte a accès à l&apos;administration de l&apos;app.
        </Alert>
      )}
      {!account.email && (
        <Alert tone="info" title="Enregistrez votre courriel">
          Vous vous connectez encore sans courriel. Ajoutez-en un : il deviendra votre identifiant et permettra de réinitialiser le mot de passe.
        </Alert>
      )}

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-6">
          <Section title="Identifiant">
            <Card className="space-y-4">
              <EmailPanel email={account.email} verified={account.emailVerified} />
              <PasswordPanel />
            </Card>
          </Section>
          <Section title="Passkeys">
            <Card>
              <PasskeysPanel passkeys={account.passkeys} />
            </Card>
          </Section>
          <Section title="Double facteur">
            <Card>
              <TotpPanel enabled={account.totp} recoveryLeft={account.recoveryLeft} />
            </Card>
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Appareils connectés">
            <Card>
              <SessionsPanel sessions={listSessions(db(), scope.userId, nowIso())} currentId={scope.sessionId} />
            </Card>
          </Section>
          <Link href="/compte/donnees" className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card hover:bg-surface-2">
            <FolderLock aria-hidden className="size-5 text-primary" />
            <div className="flex-1">
              <p className="font-medium">Mes données</p>
              <p className="text-sm text-muted">Télécharger une copie, supprimer le compte{scope.householdRole === "OWNER" ? " ou le foyer" : ""}.</p>
            </div>
            <ChevronRight aria-hidden className="size-5 text-muted" />
          </Link>
          <Section title="Activité récente">
            <Card>
              {events.length === 0 ? (
                <p className="text-sm text-muted">Rien pour le moment.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {events.map((e, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <History aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                      <span className="flex-1">
                        {e.label}
                        {e.detail && <span className="text-muted"> · {e.detail}</span>}
                      </span>
                      <time dateTime={e.createdAt} className="text-muted tabular">
                        {new Date(e.createdAt).toLocaleString("fr-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Section>
        </div>
      </div>
    </Page>
  );
}
