import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { db, today } from "@/server/context";

export const dynamic = "force-dynamic";

/** Copie cohérente de la base (API de sauvegarde SQLite), diffusée en flux puis supprimée. */
export async function GET() {
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
  // Lecture en flux (pas toute la base en mémoire) ; suppression à la fin du flux, même interrompu.
  const stream = fs.createReadStream(target);
  stream.once("close", cleanup);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="primes-lamal-${today()}.db"`,
    },
  });
}
