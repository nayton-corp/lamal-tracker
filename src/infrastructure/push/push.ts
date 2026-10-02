import { eq } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
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

/**
 * Hôtes des services push des navigateurs. Le serveur fait un POST vers l'endpoint reçu du
 * client : sans cette liste, un abonnement forgé pourrait viser une adresse du réseau local.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  /\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
  /\.push\.services\.mozilla\.com$/,
];

export function isPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return PUSH_HOSTS.some((h) => (typeof h === "string" ? url.hostname === h : h.test(url.hostname)));
}

const key = z.string().trim().min(1).max(300);

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2000).refine(isPushEndpoint, "Adresse de notification non reconnue."),
  keys: z.object({ p256dh: key, auth: key }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** Un foyer n'a pas des dizaines d'appareils : au-delà, on refuse plutôt que d'accumuler. */
export const MAX_SUBSCRIPTIONS = 20;

export function saveSubscription(db: Db, sub: PushSubscriptionInput) {
  const known = db.select({ id: pushSubscription.id }).from(pushSubscription).where(eq(pushSubscription.endpoint, sub.endpoint)).get();
  if (!known && subscriptionCount(db) >= MAX_SUBSCRIPTIONS) {
    throw new Error(`Trop d'appareils abonnés (${MAX_SUBSCRIPTIONS} au maximum) : désabonnez-en un d'abord.`);
  }
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
