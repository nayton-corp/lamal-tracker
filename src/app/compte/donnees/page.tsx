import { Download, FileText, ShieldCheck } from "lucide-react";
import { accountOverview } from "@/application/account";
import { householdAudit } from "@/application/audit";
import { confirmedUntil } from "@/application/auth";
import { deletionPreview } from "@/application/data-rights";
import { accountPageScope } from "@/server/auth";
import { db, nowIso } from "@/server/context";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Card, Section } from "@/ui/card";
import { Page, PageHeader } from "@/ui/page";
import { ConfirmIdentity, DeleteAccount, DeleteHousehold } from "./panels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes données" };

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });
const stamp = (iso: string) => new Date(iso).toLocaleString("fr-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" });

export default async function MyDataPage() {
  const scope = await accountPageScope();
  const until = confirmedUntil(db(), scope.sessionId, nowIso());
  const account = accountOverview(db(), scope.userId);
  const preview = deletionPreview(db(), scope);
  const owner = scope.householdRole === "OWNER";
  const events = owner && scope.householdId !== null ? householdAudit(db(), scope.householdId, 15) : [];

  return (
    <Page>
      <PageHeader title="Mes données" subtitle="Télécharger une copie de vos données, ou les supprimer." back="/compte" />

      {until ? (
        <Alert tone="success" title="Identité confirmée">
          Export et suppression sont ouverts jusqu&apos;à {time(until)}.
        </Alert>
      ) : (
        <Section title="Confirmez votre identité">
          <Card className="space-y-4">
            <p className="text-sm text-muted">Pour protéger vos données, l&apos;export et la suppression demandent de confirmer qu&apos;il s&apos;agit bien de vous. La confirmation vaut 10 minutes.</p>
            <ConfirmIdentity hasPasskey={account.passkeys.length > 0} />
          </Card>
        </Section>
      )}

      <Section title="Télécharger mes données">
        <Card className="space-y-3">
          <p className="text-sm text-muted">
            Tout ce que l&apos;app garde sur votre compte{scope.householdId !== null ? " et votre foyer" : ""} : personnes, contrats, rituels, lettres, signatures, journal. Le fichier JSON est la copie complète ; le PDF en est un récapitulatif lisible.
          </p>
          {until ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="secondary" block>
                <a href="/api/export?format=pdf" download>
                  <FileText aria-hidden className="size-4" /> Récapitulatif (PDF)
                </a>
              </Button>
              <Button asChild variant="secondary" block>
                <a href="/api/export?format=json" download>
                  <Download aria-hidden className="size-4" /> Copie complète (JSON)
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">Disponible après confirmation.</p>
          )}
        </Card>
      </Section>

      {owner && (
        <Section title="Journal du foyer">
          <Card>
            {events.length === 0 ? (
              <p className="text-sm text-muted">Rien pour le moment.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {events.map((e, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                    <span className="flex-1">{e.label}</span>
                    <time dateTime={e.createdAt} className="text-muted tabular">
                      {stamp(e.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      )}

      <Section title="Supprimer">
        <Card className="space-y-4">
          <p className="text-sm text-muted">
            La suppression est immédiate. Des copies de sauvegarde du serveur peuvent encore contenir ces données jusqu&apos;à leur remplacement ; les signatures y restent chiffrées.
          </p>
          {!until ? (
            <p className="text-sm text-muted">Disponible après confirmation.</p>
          ) : (
            <div className="flex flex-col items-start gap-2">
              {owner && <DeleteHousehold members={preview.othersInHousehold + 1} />}
              {preview.lastAdmin ? (
                <p className="text-sm text-muted">Le compte administrateur, seul à gérer l&apos;instance, ne peut pas être supprimé depuis l&apos;app.</p>
              ) : (
                <DeleteAccount household={scope.householdId !== null} others={preview.othersInHousehold} owner={owner} />
              )}
            </div>
          )}
        </Card>
      </Section>
    </Page>
  );
}
