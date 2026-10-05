import "server-only";
import { ZodError } from "zod";
import { parseChf } from "@/domain/money";
import { UserError } from "@/application/errors";

/*
 * Outils des server actions (src/app/actions) : erreurs traduites en message de formulaire,
 * montants saisis convertis en centimes.
 */

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

/** Violation de clé étrangère SQLite (suppression d'une ligne encore référencée). */
export function isForeignKeyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "SQLITE_CONSTRAINT_FOREIGNKEY" || /FOREIGN KEY constraint failed/i.test(error.message);
}

/**
 * Pour les actions de formulaire sans état (`<form action>`) : une erreur de référence connue
 * devient une UserError lisible ; tout le reste remonte tel quel.
 */
export function rethrowForeignKey(error: unknown, message: string): never {
  if (isForeignKeyError(error)) throw new UserError(message);
  throw error;
}

/** Montant CHF saisi dans un formulaire → centimes entiers (via domain/money). Vide → null. */
export function chfField(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === "") return null;
  let rp: number;
  try {
    rp = parseChf(String(value));
  } catch {
    throw new UserError(`Montant invalide : « ${value} »`);
  }
  if (rp < 0) throw new UserError(`Montant invalide : « ${value} » (un montant ne peut pas être négatif)`);
  return rp;
}
