import { sendFeedbackAction } from "@/app/actions/feedback";
import { FEEDBACK_KINDS } from "@/application/feedback";
import { pageScope } from "@/server/auth";
import { ActionForm } from "@/ui/action-form";
import { Card } from "@/ui/card";
import { Field, Textarea } from "@/ui/form";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Donner un avis" };

/** Avis libre envoyé à l'exploitant : un problème, une idée, une phrase pas claire. */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ depuis?: string }> }) {
  await pageScope();
  const from = (await searchParams).depuis;
  const page = from && /^\/[^\s]{0,199}$/.test(from) ? from : "";
  return (
    <Page>
      <PageHeader title="Donner un avis" back="/donnees" subtitle="Un bug, une phrase pas claire, une idée : tout est utile pour améliorer l'app." />
      <Card>
        <ActionForm action={sendFeedbackAction} hidden={{ page }} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">C&apos;est plutôt…</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(FEEDBACK_KINDS).map(([value, label], i) => (
                <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="radio" name="kind" value={value} defaultChecked={i === 0} className="size-5 accent-[var(--primary)]" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Votre message" htmlFor="message" hint="Inutile d'indiquer vos données d'assurance : décrivez ce que vous faisiez et ce qui s'est passé.">
            <Textarea id="message" name="message" required minLength={3} maxLength={2000} rows={6} />
          </Field>
          <SubmitButton block pendingLabel="Envoi…">Envoyer</SubmitButton>
          <p className="text-sm text-muted">Votre avis est lu par l&apos;exploitant de l&apos;app, avec votre adresse de courriel pour pouvoir vous répondre.</p>
        </ActionForm>
      </Card>
    </Page>
  );
}
