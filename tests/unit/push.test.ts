import { describe, expect, it } from "vitest";
import { openDb } from "@/infrastructure/db/client";
import { testAccount } from "../accounts";
import { isPushEndpoint, MAX_SUBSCRIPTIONS, pushSubscriptionSchema, saveSubscription, subscriptionCount } from "@/infrastructure/push/push";

describe("abonnements push", () => {
  it("n'accepte que les services push des navigateurs, en HTTPS", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QZ1x")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isPushEndpoint("https://ch1.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isPushEndpoint("https://db5p.notify.windows.com/w/?token=x")).toBe(true);
    // SSRF vers le réseau local, hôte inconnu, HTTP clair, hôte « ressemblant »
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://192.168.1.10/admin")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.evil.ch/x")).toBe(false);
    expect(isPushEndpoint("https://push.apple.com/x")).toBe(false);
    expect(isPushEndpoint("pas une url")).toBe(false);
  });

  it("valide la forme de l'abonnement", () => {
    const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "k", auth: "a" } };
    expect(pushSubscriptionSchema.safeParse(ok).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ ...ok, keys: { p256dh: "", auth: "a" } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...ok, keys: { p256dh: "k".repeat(301), auth: "a" } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://10.0.0.1/", keys: ok.keys }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse(null).success).toBe(false);
  });

  it("plafonne le nombre d'appareils, sans bloquer la mise à jour d'un appareil connu", () => {
    const db = openDb(":memory:");
    const { userId } = testAccount(db);
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) {
      saveSubscription(db, userId, { endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, keys: { p256dh: "k", auth: "a" } });
    }
    expect(subscriptionCount(db, userId)).toBe(MAX_SUBSCRIPTIONS);
    expect(() => saveSubscription(db, userId, { endpoint: "https://fcm.googleapis.com/fcm/send/new", keys: { p256dh: "k", auth: "a" } })).toThrow(/Trop d'appareils/);
    saveSubscription(db, userId, { endpoint: "https://fcm.googleapis.com/fcm/send/0", keys: { p256dh: "k2", auth: "a2" } });
    expect(subscriptionCount(db, userId)).toBe(MAX_SUBSCRIPTIONS);
  });
});
