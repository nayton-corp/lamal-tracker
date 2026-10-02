import fs from "node:fs";
import path from "node:path";
import { runDailyJobs } from "@/application/jobs";
import type { AppContext } from "@/application/context";
import { backupDatabase, dataDir } from "@/infrastructure/db/client";
import { webPushSender } from "@/infrastructure/push/web-push";

const KEEP_BACKUPS = 14;

export function backupDir(): string {
  return process.env.BACKUP_DIR ?? path.join(/*turbopackIgnore: true*/ dataDir(), "backups");
}

/** Sauvegarde quotidienne de la base dans data/backups (rotation sur 14 jours). */
export async function dailyBackup(ctx: AppContext): Promise<string> {
  const dir = backupDir();
  const file = path.join(/*turbopackIgnore: true*/ dir, `lamal-${ctx.clock.today()}.sqlite`);
  if (!fs.existsSync(file)) await backupDatabase(ctx.db, file);
  const backups = fs
    .readdirSync(dir)
    .filter((f) => /^lamal-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
    .sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP_BACKUPS))) fs.rmSync(path.join(/*turbopackIgnore: true*/ dir, old), { force: true });
  return file;
}

export function listBackups(): { name: string; size: number }[] {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sqlite"))
    .sort()
    .reverse()
    .map((name) => ({ name, size: fs.statSync(path.join(/*turbopackIgnore: true*/ dir, name)).size }));
}

async function runJob(ctx: AppContext, job: string, fn: () => Promise<string>): Promise<void> {
  const today = ctx.clock.today();
  const last = ctx.system.lastSuccessfulRun(job);
  if (last && last.startedAt.slice(0, 10) === today) return;
  const id = ctx.system.startJob(job, ctx.clock.nowIso());
  try {
    const message = await fn();
    ctx.system.finishJob(id, ctx.clock.nowIso(), true, message);
  } catch (e) {
    ctx.system.finishJob(id, ctx.clock.nowIso(), false, (e as Error).message);
    console.error(`[jobs] ${job} a échoué :`, e);
  }
}

/** Exécute les tâches du jour si elles n'ont pas encore réussi aujourd'hui. */
export async function tick(ctx: AppContext): Promise<void> {
  await runJob(ctx, "backup", async () => `Sauvegarde ${await dailyBackup(ctx)}`);
  await runJob(ctx, "daily", async () => {
    const r = await runDailyJobs(ctx, webPushSender(ctx.system));
    return [r.fetch ? `OFSP : ${r.fetch.message}` : null, `${r.notifications.length} notification(s)`].filter(Boolean).join(" · ");
  });
}

let started = false;

/** Démarre la boucle horaire (une seule fois par processus). */
export function startScheduler(getCtx: () => AppContext): void {
  if (started) return;
  started = true;
  const run = () => {
    tick(getCtx()).catch((e) => console.error("[jobs]", e));
  };
  setTimeout(run, 20_000).unref();
  setInterval(run, 60 * 60 * 1000).unref();
}
