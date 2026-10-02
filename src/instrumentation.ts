export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_SCHEDULER === "true") return;
  const { schedulerTick } = await import("./server/watch");
  const run = () => schedulerTick().catch((e) => console.error("[scheduler]", e));
  // Premier passage peu après le démarrage, puis toutes les heures.
  setTimeout(run, 30_000);
  setInterval(run, 60 * 60 * 1000);
}
