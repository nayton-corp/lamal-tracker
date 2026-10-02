import { desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { appSetting, jobRun, notificationLog, pushSubscription } from "./schema";

export type NotificationRow = typeof notificationLog.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscription.$inferSelect;

export class SystemRepository {
  constructor(private readonly db: Db) {}

  setting<T>(key: string): T | undefined {
    return this.db.select().from(appSetting).where(eq(appSetting.key, key)).get()?.value as T | undefined;
  }

  saveSetting(key: string, value: unknown): void {
    this.db.insert(appSetting).values({ key, value }).onConflictDoUpdate({ target: appSetting.key, set: { value } }).run();
  }

  /** Enregistre une notification si sa clé est nouvelle ; retourne null si elle existait déjà. */
  addNotification(input: { key: string; title: string; body: string; url: string | null }): NotificationRow | null {
    const row = this.db.insert(notificationLog).values(input).onConflictDoNothing().returning().get();
    return row ?? null;
  }

  notifications(limit = 50): NotificationRow[] {
    return this.db.select().from(notificationLog).orderBy(desc(notificationLog.id)).limit(limit).all();
  }

  unreadCount(): number {
    return this.db.select({ n: sql<number>`count(*)` }).from(notificationLog).where(isNull(notificationLog.readAt)).get()?.n ?? 0;
  }

  markAllRead(nowIso: string): void {
    this.db.update(notificationLog).set({ readAt: nowIso }).where(isNull(notificationLog.readAt)).run();
  }

  markPushed(id: number, count: number): void {
    this.db.update(notificationLog).set({ pushedCount: count }).where(eq(notificationLog.id, id)).run();
  }

  pushSubscriptions(): PushSubscriptionRow[] {
    return this.db.select().from(pushSubscription).all();
  }

  savePushSubscription(input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string | null }): void {
    this.db
      .insert(pushSubscription)
      .values(input)
      .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { keys: input.keys, userAgent: input.userAgent } })
      .run();
  }

  deletePushSubscription(endpoint: string): void {
    this.db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint)).run();
  }

  startJob(job: string, nowIso: string): number {
    return this.db.insert(jobRun).values({ job, startedAt: nowIso }).returning({ id: jobRun.id }).get().id;
  }

  finishJob(id: number, nowIso: string, ok: boolean, message: string | null): void {
    this.db.update(jobRun).set({ finishedAt: nowIso, ok, message }).where(eq(jobRun.id, id)).run();
  }

  recentJobs(limit = 20) {
    return this.db.select().from(jobRun).orderBy(desc(jobRun.id)).limit(limit).all();
  }

  lastSuccessfulRun(job: string) {
    return this.db
      .select()
      .from(jobRun)
      .where(sql`${jobRun.job} = ${job} AND ${jobRun.ok} = 1`)
      .orderBy(desc(jobRun.id))
      .get();
  }
}
