"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";
import { cn } from "./cn";
import { buttonClass, type ButtonVariant } from "./primitives";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>({ ok: true });

/** Erreur de champ renvoyée par l'action du formulaire englobant. */
export function useFieldError(name: string): string | undefined {
  return useContext(FormStateContext).fieldErrors?.[name];
}

export function FieldError({ name }: { name: string }) {
  const error = useFieldError(name);
  return error ? <p className="text-xs font-medium text-up">{error}</p> : null;
}

export function ActionForm({
  action,
  children,
  className,
  showSuccess = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, { ok: true });
  return (
    <FormStateContext.Provider value={state}>
      <form action={formAction} className={cn("flex flex-col gap-4", className)} noValidate>
        {children}
        {state.message && (state.ok ? showSuccess : true) && (
          <p
            role={state.ok ? "status" : "alert"}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium",
              state.ok ? "bg-down-soft text-down" : "bg-up-soft text-up",
            )}
          >
            {state.message}
          </p>
        )}
      </form>
    </FormStateContext.Provider>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
  name,
  value,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={buttonClass(variant, className)}>
      {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Champ de formulaire : libellé, aide et erreur renvoyée par l'action. */
export function FormField({ name, label, hint, children }: { name: string; label: string; hint?: ReactNode; children: ReactNode }) {
  const error = useFieldError(name);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs font-medium text-up">{error}</p>}
    </div>
  );
}
