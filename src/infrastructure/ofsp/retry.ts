/**
 * Nouvel essai d'import d'une année dont l'archive n'est pas encore publiée : on ne retélécharge
 * pas le fichier OFSP toutes les heures, on attend au moins un jour entre deux tentatives.
 */
export const YEAR_RETRY_HOURS = 24;

export function yearAttemptKey(year: number): string {
  return `ofsp.yearAttempt.${year}`;
}

/** Vrai si aucune tentative n'est connue, ou si la dernière remonte à plus de `hours` heures. */
export function yearRetryDue(lastAttempt: { at: string } | null, nowMs: number, hours = YEAR_RETRY_HOURS): boolean {
  if (!lastAttempt) return true;
  const age = nowMs - Date.parse(lastAttempt.at);
  return !Number.isFinite(age) || age >= hours * 3_600_000;
}
