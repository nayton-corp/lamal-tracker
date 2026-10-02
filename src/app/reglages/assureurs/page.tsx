import type { Metadata } from "next";
import { saveInsurerAction } from "@/app/actions";
import { reviewTargetYear } from "@/domain/deadlines";
import { app } from "@/server/app";
import { ActionForm, FormField, SubmitButton } from "@/ui/action-form";
import { Badge, Card, CardTitle, Input, ListRow, Notice, PageHeader, inputClass } from "@/ui/primitives";
import { one, type Search } from "@/ui/search-params";

export const metadata: Metadata = { title: "Assureurs" };

const SOURCE_LABEL = { SEED: "à vérifier", USER: "saisi", DATASET: "OFSP", UNKNOWN: "inconnu" } as const;

export default async function InsurersPage({ searchParams }: PageProps<"/reglages/assureurs">) {
  const sp = (await searchParams) as Search;
  const ctx = app();
  const year = reviewTargetYear(ctx.clock.today());
  const editId = Number(one(sp, "id")) || null;
  const editing = editId ? ctx.reference.insurer(editId) : undefined;
  const address = editId ? ctx.reference.terminationAddress(editId, year) : undefined;
  const insurers = ctx.reference.insurers();

  if (one(sp, "id") !== undefined) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={editing ? editing.name : "Nouvel assureur"} back="/reglages/assureurs" />
        <Notice tone="info">
          Vérifie l&apos;adresse de résiliation sur le site de la caisse ou sur ta police : certaines caisses utilisent une case postale dédiée.
        </Notice>
        <Card>
          <ActionForm action={saveInsurerAction}>
            <FormField name="id" label="Numéro OFSP" hint="Visible sur priminfo.admin.ch et dans le fichier des primes.">
              <Input
                id="id"
                name="id"
                type="number"
                inputMode="numeric"
                defaultValue={editing?.id ?? editId ?? ""}
                readOnly={Boolean(editing)}
                required
              />
            </FormField>
            <FormField name="name" label="Nom">
              <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
            </FormField>
            <FormField name="website" label="Site web (facultatif)">
              <Input id="website" name="website" type="url" defaultValue={editing?.website ?? ""} />
            </FormField>
            <CardTitle className="mb-0 mt-2">Adresse de résiliation</CardTitle>
            <FormField name="recipientName" label="Destinataire" hint="Ex. « CSS Assurance-maladie SA »">
              <Input id="recipientName" name="recipientName" defaultValue={address?.recipientName ?? ""} />
            </FormField>
            <FormField name="addressLines" label="Adresse" hint="Une ligne par ligne d'adresse : service, case postale ou rue, NPA localité.">
              <textarea
                id="addressLines"
                name="addressLines"
                rows={4}
                defaultValue={address?.addressLines.join("\n") ?? ""}
                className={`${inputClass} py-3`}
              />
            </FormField>
            <FormField name="validFromYear" label="Valable dès l'année">
              <Input id="validFromYear" name="validFromYear" type="number" inputMode="numeric" defaultValue={address?.validFromYear ?? year - 1} />
            </FormField>
            <FormField name="source" label="Source (facultatif)">
              <Input id="source" name="source" defaultValue={address?.source ?? ""} placeholder="ex. site web, police 2026" />
            </FormField>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Assureurs"
        back="/reglages"
        subtitle="Le fichier OFSP ne contient que les numéros : les noms et adresses sont à confirmer ici."
      />
      <Card className="py-1">
        <ul>
          <li>
            <ListRow href="/reglages/assureurs?id=">
              <p className="font-semibold text-primary">+ Ajouter un assureur</p>
            </ListRow>
          </li>
          {insurers.map((i) => {
            const addr = ctx.reference.terminationAddress(i.id, year);
            return (
              <li key={i.id}>
                <ListRow href={`/reglages/assureurs?id=${i.id}`} trailing={addr ? <Badge tone="down">Adresse</Badge> : <Badge>Sans adresse</Badge>}>
                  <p className="truncate font-semibold">{i.name}</p>
                  <p className="text-xs text-muted">
                    n° {i.id} · nom {SOURCE_LABEL[i.nameSource]}
                  </p>
                </ListRow>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
