"use client";

import { useActionState, useEffect } from "react";
import { saveLcaAction } from "@/app/actions/household";
import { Alert } from "@/ui/alert";
import { Checkbox, Field, FormError, Input, Select } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";

export interface LcaDefaults {
  id?: number;
  insurerName: string;
  linkedInsurerId: number | null;
  productName: string;
  category: string;
  policyNumber: string | null;
  monthlyRp: number | null;
  minTermEnd: string | null;
  noticeMonths: number | null;
  active: boolean;
}

export function LcaForm({ personId, insurers, lca, onDone }: { personId: number; insurers: { id: number; name: string }[]; lca: LcaDefaults | null; onDone?: () => void }) {
  const [state, action] = useActionState(saveLcaAction, null);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {lca?.id && <input type="hidden" name="id" value={lca.id} />}
      <input type="hidden" name="personId" value={personId} />
      <Field label="Assureur LCA" htmlFor="insurerName" error={fe.insurerName} hint="Souvent une autre société du même groupe (ex. « Helsana Assurances complémentaires SA »).">
        <Input id="insurerName" name="insurerName" required defaultValue={lca?.insurerName} />
      </Field>
      <Field label="Groupe de la caisse LAMal" htmlFor="linkedInsurerId" hint="Permet d'alerter si vous quittez la LAMal de ce groupe.">
        <Select id="linkedInsurerId" name="linkedInsurerId" defaultValue={lca?.linkedInsurerId ?? ""}>
          <option value="">Aucun / autre groupe</option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Produit" htmlFor="productName" error={fe.productName}>
          <Input id="productName" name="productName" required defaultValue={lca?.productName} placeholder="Hospitalisation mi-privée" />
        </Field>
        <Field label="Catégorie" htmlFor="category">
          <Select id="category" name="category" defaultValue={lca?.category ?? "HOSPITAL"}>
            <option value="HOSPITAL">Hospitalisation</option>
            <option value="AMBULATORY">Ambulatoire</option>
            <option value="DENTAL">Dentaire</option>
            <option value="OTHER">Autre</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prime mensuelle (CHF)" htmlFor="monthly">
          <Input id="monthly" name="monthly" inputMode="decimal" defaultValue={lca?.monthlyRp ? (lca.monthlyRp / 100).toFixed(2) : ""} />
        </Field>
        <Field label="N° de police" htmlFor="lcaPolicyNumber">
          <Input id="lcaPolicyNumber" name="policyNumber" defaultValue={lca?.policyNumber ?? ""} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Durée minimale jusqu'au" htmlFor="minTermEnd">
          <Input id="minTermEnd" name="minTermEnd" type="date" defaultValue={lca?.minTermEnd ?? ""} />
        </Field>
        <Field label="Préavis (mois)" htmlFor="noticeMonths">
          <Input id="noticeMonths" name="noticeMonths" inputMode="numeric" defaultValue={lca?.noticeMonths ?? ""} />
        </Field>
      </div>
      <input type="hidden" name="active" value="off" />
      <Checkbox name="active" value="on" defaultChecked={lca?.active ?? true} label="Contrat en cours" />
      <FormError message={state?.error} />
      {state?.ok && <Alert tone="success" title={state.ok} />}
      <SubmitButton block>Enregistrer la complémentaire</SubmitButton>
    </form>
  );
}
