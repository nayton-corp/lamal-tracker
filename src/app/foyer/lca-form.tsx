"use client";

import { useActionState, useEffect, useState } from "react";
import { saveLcaAction } from "@/app/actions/household";
import { LCA_GUARANTEES } from "@/domain/lca";
import { Alert } from "@/ui/alert";
import { Checkbox, Field, FormError, Input, Select } from "@/ui/form";
import { SubmitButton } from "@/ui/submit";
import { rpToInput } from "@/domain/money";

export interface LcaDefaults {
  id?: number;
  insurerName: string;
  linkedInsurerId: number | null;
  productName: string;
  guarantee: string | null;
  policyNumber: string | null;
  monthlyRp: number | null;
  minTermEnd: string | null;
  noticeMonths: number | null;
  active: boolean;
}

export type LcaInsurerOption = { id: number; name: string; lcaName: string };

export function LcaForm({
  personId,
  insurers,
  lca,
  lamalInsurerId,
  onDone,
}: {
  personId: number;
  insurers: LcaInsurerOption[];
  lca: LcaDefaults | null;
  /** Caisse LAMal actuelle de la personne : préremplit l'assureur LCA (même groupe le plus souvent). */
  lamalInsurerId: number | null;
  onDone?: () => void;
}) {
  const [state, action] = useActionState(saveLcaAction, null);
  const initialLinked = lca ? lca.linkedInsurerId : lamalInsurerId;
  const [linked, setLinked] = useState<string>(initialLinked ? String(initialLinked) : "");
  const suggested = (id: string) => insurers.find((i) => String(i.id) === id)?.lcaName ?? "";
  const [insurerName, setInsurerName] = useState(lca?.insurerName ?? suggested(linked));
  const [nameTouched, setNameTouched] = useState(Boolean(lca));
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {lca?.id && <input type="hidden" name="id" value={lca.id} />}
      <input type="hidden" name="personId" value={personId} />
      <Field label="Garantie" htmlFor="guarantee" error={fe.guarantee}>
        <Select id="guarantee" name="guarantee" required defaultValue={lca?.guarantee ?? ""}>
          <option value="" disabled>
            Choisir…
          </option>
          {LCA_GUARANTEES.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Groupe de la caisse LAMal" htmlFor="linkedInsurerId" hint="Votre caisse LAMal par défaut : permet d'alerter si vous la quittez.">
        <Select
          id="linkedInsurerId"
          name="linkedInsurerId"
          value={linked}
          onChange={(e) => {
            setLinked(e.target.value);
            if (!nameTouched) setInsurerName(suggested(e.target.value));
          }}
        >
          <option value="">Aucun / autre groupe</option>
          {insurers.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Assureur LCA" htmlFor="insurerName" error={fe.insurerName} hint="Prérempli d'après la caisse LAMal ; précisez la société de votre police si elle diffère.">
        <Input
          id="insurerName"
          name="insurerName"
          required
          value={insurerName}
          onChange={(e) => {
            setInsurerName(e.target.value);
            setNameTouched(true);
          }}
        />
      </Field>
      <Field label="Nom du produit (facultatif)" htmlFor="productName" hint="Tel qu'écrit sur la police, par exemple « Hospital Flex ».">
        <Input id="productName" name="productName" defaultValue={lca?.guarantee ? lca.productName : (lca?.productName ?? "")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prime mensuelle (CHF, facultatif)" htmlFor="monthly">
          <Input id="monthly" name="monthly" inputMode="decimal" defaultValue={lca?.monthlyRp ? rpToInput(lca.monthlyRp) : ""} />
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
