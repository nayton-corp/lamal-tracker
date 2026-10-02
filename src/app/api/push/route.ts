import { vapidKeys } from "@/infrastructure/push/push";
import { db } from "@/server/context";

export const dynamic = "force-dynamic";

/** Clé publique VAPID pour l'abonnement du navigateur. */
export function GET() {
  return Response.json({ publicKey: vapidKeys(db()).publicKey });
}
