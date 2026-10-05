import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { audit } from "@/application/audit";
import { adminNeedsFactor, isFreshSession } from "@/application/auth";
import { db, nowIso, today } from "@/server/context";
import { currentScope } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Copie cohérente de la base (API de sauvegarde SQLite), diffusée en flux puis supprimée. Elle
 * contient les données de tous les foyers : réservée à l'administrateur protégé d'un second
 * facteur, identité confirmée depuis moins de 10 minutes (page Mes données), et journalisée.
 */
export async function GET() {
  const scope = await currentScope();
  if (!scope?.isAdmin || adminNeedsFactor(db(), scope.userId)) return new Response("Non autorisé", { status: 403 });
  if (!isFreshSession(db(), scope.sessionId, nowIso())) return new Response(null, { status: 303, headers: { Location: "/compte/donnees" } });
  // Nom imprévisible : le dossier temporaire est partagé avec les autres processus.
  const target = path.join(os.tmpdir(), `lamal-${randomUUID()}.db`);
  const cleanup = () => fs.rm(target, { force: true }, () => {});
  let size: number;
  try {
    await db().$client.backup(target);
    size = fs.statSync(target).size;
  } catch (error) {
    cleanup();
    throw error;
  }
  audit(db(), scope.userId, "BACKUP_DOWNLOADED", { nowIso: nowIso() });
  // Lecture en flux (pas toute la base en mémoire) ; suppression à la fin du flux, même interrompu.
  const stream = fs.createReadStream(target);
  stream.once("close", cleanup);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="primes-lamal-${today()}.db"`,
      "Cache-Control": "no-store",
    },
  });
}
