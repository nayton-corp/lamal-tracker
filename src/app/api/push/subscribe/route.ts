import { z } from "zod";
import { vapidKeys } from "@/infrastructure/push/web-push";
import { app } from "@/server/app";

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** Clé publique VAPID nécessaire au navigateur pour s'abonner. */
export function GET() {
  return Response.json({ publicKey: vapidKeys(app().system).publicKey });
}

export async function POST(request: Request) {
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Abonnement invalide." }, { status: 400 });
  app().system.savePushSubscription({ ...parsed.data, userAgent: request.headers.get("user-agent") });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return Response.json({ ok: false }, { status: 400 });
  app().system.deletePushSubscription(body.endpoint);
  return Response.json({ ok: true });
}
