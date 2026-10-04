import { masterKeyMatches } from "@/infrastructure/crypto/vault";
import { db } from "@/server/context";

export const dynamic = "force-dynamic";

/** Résultat du contrôle de la clé maître, une fois par processus (il ne change pas en cours de route). */
let keyOk: boolean | null | undefined;

/**
 * Point de santé public (surveillance, Docker) : la base répond, et la clé maître est bien celle
 * qui a chiffré les données. Rien d'autre n'est dit.
 */
export function GET() {
  db().$client.prepare("select 1").get();
  if (keyOk === undefined || keyOk === null) keyOk = masterKeyMatches(db());
  if (keyOk === false) return Response.json({ ok: false, error: "clé maître" }, { status: 503 });
  return Response.json({ ok: true });
}
