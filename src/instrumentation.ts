/** Démarre les tâches planifiées (sauvegarde, détection des primes, rappels) avec le serveur. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.JOBS_DISABLED === "1") return;
  const { startScheduler } = await import("./infrastructure/jobs/scheduler");
  const { app } = await import("./server/app");
  startScheduler(app);
}
