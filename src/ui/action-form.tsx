"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import type { ActionState } from "@/server/action";
import { Alert } from "./alert";
import { FormError } from "./form";

/** Formulaire branché sur une server action, avec messages d'erreur / succès. */
export function ActionForm({ action, children, className, hidden }: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  hidden?: Record<string, string | number>;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {state?.error && (
        <div className="mt-2 whitespace-pre-line">
          <FormError message={state.error} />
        </div>
      )}
      {state?.ok && <Alert tone="success" title={state.ok} className="mt-2" />}
    </form>
  );
}
