import webpush from "web-push";
import type { NotificationInput, PushSender } from "@/application/jobs";
import type { SystemRepository } from "@/infrastructure/db/system-repository";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** Clés VAPID générées au premier démarrage et conservées en base (aucune configuration requise). */
export function vapidKeys(system: SystemRepository): VapidKeys {
  const fromEnv = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY;
  if (fromEnv) return { publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! };
  const stored = system.setting<VapidKeys>("vapid");
  if (stored) return stored;
  const keys = webpush.generateVAPIDKeys();
  system.saveSetting("vapid", keys);
  return keys;
}

export function webPushSender(system: SystemRepository): PushSender {
  return async (n: NotificationInput) => {
    const subs = system.pushSubscriptions();
    if (subs.length === 0) return 0;
    const keys = vapidKeys(system);
    const subject = process.env.VAPID_SUBJECT ?? "mailto:lamal-tracker@localhost";
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url ?? "/", tag: n.key });
    let ok = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, {
            vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
            TTL: 60 * 60 * 24,
          });
          ok += 1;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // Abonnement expiré ou révoqué : on le retire.
          if (status === 404 || status === 410) system.deletePushSubscription(s.endpoint);
        }
      }),
    );
    return ok;
  };
}
