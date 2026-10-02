import { eq } from "drizzle-orm";
import webpush from "web-push";
import type { Db } from "../db/client";
import { notificationLog, pushSubscription } from "../db/schema";
import { getSetting, setSetting } from "../db/settings";

interface Vapid {
  publicKey: string;
  privateKey: string;
}

/** Clés VAPID générées au premier besoin et conservées en base. */
export function vapidKeys(db: Db): Vapid {
  let keys = getSetting<Vapid>(db, "push.vapid");
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    setSetting(db, "push.vapid", keys);
  }
  return keys;
}

export function saveSubscription(db: Db, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  db.insert(pushSubscription)
    .values({ endpoint: sub.endpoint, keys: sub.keys })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { keys: sub.keys } })
    .run();
}

export function removeSubscription(db: Db, endpoint: string) {
  db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint)).run();
}

export function subscriptionCount(db: Db): number {
  return db.select().from(pushSubscription).all().length;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

/**
 * Envoie une notification à tous les appareils abonnés. `dedupeKey` garantit qu'un
 * même rappel n'est envoyé qu'une fois (ex. « rappel-2027-J7 »).
 */
export async function notifyAll(db: Db, msg: PushMessage, dedupeKey?: string): Promise<number> {
  if (dedupeKey) {
    const done = db.select().from(notificationLog).where(eq(notificationLog.key, dedupeKey)).get();
    if (done) return 0;
  }
  const keys = vapidKeys(db);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@localhost", keys.publicKey, keys.privateKey);
  let sent = 0;
  for (const sub of db.select().from(pushSubscription).all()) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(msg), { TTL: 60 * 60 * 24 });
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) removeSubscription(db, sub.endpoint);
      else console.error("[push] échec d'envoi", status ?? error);
    }
  }
  if (dedupeKey) db.insert(notificationLog).values({ key: dedupeKey }).onConflictDoNothing().run();
  return sent;
}
