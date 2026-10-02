import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { lcaWishesAction, lineFlagsAction } from "@/app/actions/review";
import { lcaWishesFor } from "@/application/offers";
import { LCA_GUARANTEES } from "@/domain/lca";
import { getReviewByYear, getReviewView } from "@/application/review";
import { requiresDoctorCheck, type ModelType } from "@/domain/lamal";
import { lcaPolicy } from "@/infrastructure/db/schema";
import { db, today } from "@/server/context";
import { ActionForm } from "@/ui/action-form";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Checkbox, Select } from "@/ui/form";
import { Chf } from "@/ui/money";
import { Page, PageHeader } from "@/ui/page";
import { SubmitButton } from "@/ui/submit";
import { LcaConfirm } from "./lca-confirm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contrôle LCA" };

export default async function LcaPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  const r = getReviewByYear(db(), year);
  if (!r) redirect(`/rituel/${year}`);
  const view = getReviewView(db(), r.id, today());
  const switching = view.persons.filter((p) => p.line.decision === "SWITCH");
  const allDone = switching.every((p) => p.line.lcaAckAt);

  return (
    <Page>
      <PageHeader title="Complémentaires LCA" back={`/rituel/${year}`} />
      <div className="rounded-2xl border-2 border-lca-strong bg-lca-soft p-4 text-lca">
        <div className="flex gap-3">
          <ShieldAlert aria-hidden className="size-8 shrink-0" />
          <div className="space-y-1">
            <p className="text-lg font-bold">Ne résiliez jamais votre LCA par erreur</p>
            <p className="text-sm text-foreground/90">
              La LAMal (assurance de base) et la LCA (complémentaires) sont deux contrats distincts. Changer de caisse de base ne touche pas aux complémentaires, mais une
              complémentaire résiliée peut être impossible à retrouver : la nouvelle caisse peut refuser selon votre état de santé.
            </p>
          </div>
        </div>
      </div>

      {switching.length === 0 && <p className="text-muted">Personne ne change de caisse : rien à contrôler.</p>}

      {switching.map((pr) => {
        const contracts = db()
          .select()
          .from(lcaPolicy)
          .where(and(eq(lcaPolicy.personId, pr.person.id), eq(lcaPolicy.active, true)))
          .all();
        return (
          <Card key={pr.line.id} className="space-y-4">
            <div>
              <p className="text-lg font-semibold">{pr.person.firstName}</p>
              <p className="text-sm text-muted">
                Quitte {pr.currentInsurer} pour {pr.chosenInsurer} (LAMal)
              </p>
            </div>
            {contracts.length > 0 ? (
              <ul className="space-y-2">
                {contracts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-lca-strong/50 p-3 text-sm">
                    <span>
                      <span className="block font-medium">{c.productName}</span>
                      <span className="text-muted">{c.insurerName}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold text-lca">reste active</span>
                      {c.monthlyRp ? <Chf rp={c.monthlyRp} className="text-muted" /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                Aucune complémentaire enregistrée pour {pr.person.firstName}. <Link className="text-primary underline" href={`/foyer/personne/${pr.person.id}`}>En ajouter</Link> si sa police en mentionne.
              </p>
            )}
            <ActionForm action={lcaWishesAction} hidden={{ lineId: pr.line.id }} className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-sm font-medium">Complémentaires à demander à {pr.chosenInsurer}</p>
              <p className="text-sm text-muted">Elles figureront dans la demande d&apos;offre. Gardez les actuelles jusqu&apos;à l&apos;acceptation écrite des nouvelles.</p>
              {(() => {
                const wishes = new Set<string>(lcaWishesFor(db(), pr.line));
                return LCA_GUARANTEES.map((g) => (
                  <Checkbox key={g.key} name="wish" value={g.key} defaultChecked={wishes.has(g.key)} label={g.label} />
                ));
              })()}
              <SubmitButton size="sm" variant="secondary">Enregistrer</SubmitButton>
            </ActionForm>

            <ul className="space-y-1 text-sm">
              {pr.lcaWarnings.map((w) => (
                <li key={w.text} className={w.level === "danger" ? "font-medium text-lca" : "text-muted"}>
                  • {w.text}
                </li>
              ))}
            </ul>

            {requiresDoctorCheck((pr.line.chosenModelType ?? "STANDARD") as ModelType) && (
            <ActionForm action={lineFlagsAction} hidden={{ lineId: pr.line.id }} className="space-y-2 rounded-xl bg-surface-2 p-3">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Médecin{pr.person.doctorName ? ` (${pr.person.doctorName})` : ""} présent dans la liste du modèle choisi ?</span>
                  <Select name="doctorCheck" defaultValue={pr.line.doctorCheck}>
                    <option value="UNKNOWN">Pas encore vérifié</option>
                    <option value="YES">Oui</option>
                    <option value="NO">Non</option>
                  </Select>
                </label>
              <SubmitButton size="sm" variant="secondary">Enregistrer</SubmitButton>
            </ActionForm>
            )}

            <LcaConfirm lineId={pr.line.id} person={pr.person.firstName} currentInsurer={pr.currentInsurer} acknowledgedAt={pr.line.lcaAckAt} />
          </Card>
        );
      })}

      {switching.length > 0 && allDone && (
        <Button asChild block size="lg">
          <Link href={`/rituel/${year}/lettres`}>Passer aux démarches</Link>
        </Button>
      )}
    </Page>
  );
}
