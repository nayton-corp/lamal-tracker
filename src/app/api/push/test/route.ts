import { webPushSender } from "@/infrastructure/push/web-push";
import { app } from "@/server/app";

/** Envoie une notification de test à tous les appareils abonnés (non journalisée). */
export async function POST() {
  const sent = await webPushSender(app().system)({
    key: `test-${Date.now()}`,
    title: "LAMal Tracker",
    body: "Les notifications fonctionnent sur cet appareil.",
    url: "/notifications",
  });
  return Response.json({ ok: sent > 0, sent });
}
