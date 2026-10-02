import "server-only";
import { ZodError } from "zod";
import { UserError } from "@/application/review";

export type ActionState = { ok?: string; error?: string; fieldErrors?: Record<string, string> } | null;

/** Traduit les erreurs connues en message affichable ; les autres remontent (vraie panne). */
export function toActionError(error: unknown): ActionState {
  if (error instanceof UserError) return { error: error.message };
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { error: "Certains champs sont invalides.", fieldErrors };
  }
  throw error;
}

export function chfField(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === "") return null;
  const cleaned = String(value).replace(/[\s'’]/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new UserError(`Montant invalide : « ${value} »`);
  return Math.round(n * 100);
}
