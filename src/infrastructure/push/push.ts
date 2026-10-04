import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { z } from "zod";
import type { Db } from "../db/client";
import { householdMember, notificationLog, pushSubscription } from "../db/schema";
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

/** Un compte n'a pas des dizaines d'appareils : au-delà, on refuse plutôt que d'accumuler. */
export const MAX_SUBSCRIPTIONS = 20;

/** Abonne un appareil pour ce compte ; un appareil déjà connu passe au compte qui l'abonne. */
export function saveSubscription(db: Db, userId: number, sub: PushSubscriptionInput) {
  const known = db.select({ userId: pushSubscription.userId }).from(pushSubscription).where(eq(pushSubscription.endpoint, sub.endpoint)).get();
  if (known?.userId !== userId && subscriptionCount(db, userId) >= MAX_SUBSCRIPTIONS) {
    throw new Error(`Trop d'appareils abonnés (${MAX_SUBSCRIPTIONS} au maximum) : désabonnez-en un d'abord.`);
  }
  db.insert(pushSubscription)
    .values({ userId, endpoint: sub.endpoint, keys: sub.keys })
    .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { userId, keys: sub.keys } })
    .run();
}

export function removeSubscription(db: Db, userId: number, endpoint: string) {
  db.delete(pushSubscription).where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint))).run();
}

export function subscriptionCount(db: Db, userId: number): number {
  return db.select({ id: pushSubscription.id }).from(pushSubscription).where(eq(pushSubscription.userId, userId)).all().length;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

/** Destinataires : tous les comptes, ceux d'un foyer, ou un seul compte. */
export type Audience = { all: true } | { householdId: number } | { userId: number };

function subscriptionsOf(db: Db, audience: Audience) {
  if ("all" in audience) return db.select().from(pushSubscription).all();
  if ("userId" in audience) return db.select().from(pushSubscription).where(eq(pushSubscription.userId, audience.userId)).all();
  return db
    .select({ subscription: pushSubscription })
    .from(pushSubscription)
    .innerJoin(householdMember, eq(householdMember.userId, pushSubscription.userId))
    .where(eq(householdMember.householdId, audience.householdId))
    .all()
    .map((r) => r.subscription);
}

/**
 * Envoie une notification aux appareils abonnés de l'audience. `dedupeKey` garantit qu'un même
 * rappel n'est envoyé qu'une fois (ex. « h3:rappel-2027-J7 » : une fois par foyer).
 */
export async function notify(db: Db, audience: Audience, msg: PushMessage, dedupeKey?: string): Promise<number> {
  if (dedupeKey) {
    const done = db.select().from(notificationLog).where(eq(notificationLog.key, dedupeKey)).get();
    if (done) return 0;
  }
  const keys = vapidKeys(db);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@localhost", keys.publicKey, keys.privateKey);
  let sent = 0;
  for (const sub of subscriptionsOf(db, audience)) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(msg), { TTL: 60 * 60 * 24 });
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) db.delete(pushSubscription).where(eq(pushSubscription.id, sub.id)).run();
      else console.error("[push] échec d'envoi", status ?? error);
    }
  }
  if (dedupeKey) db.insert(notificationLog).values({ key: dedupeKey }).onConflictDoNothing().run();
  return sent;
}

/** Clé de dédoublonnage propre à un foyer. */
export function householdKey(householdId: number, key: string): string {
  return `h${householdId}:${key}`;
}
