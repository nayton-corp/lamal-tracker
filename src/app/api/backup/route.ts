import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db, today } from "@/server/context";

export const dynamic = "force-dynamic";

/** Copie cohérente de la base (API de sauvegarde SQLite), à télécharger. */
export async function GET() {
  const target = path.join(os.tmpdir(), `lamal-${Date.now()}.db`);
  await db().$client.backup(target);
  const data = fs.readFileSync(target);
  fs.unlinkSync(target);
  return new Response(data, {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="primes-lamal-${today()}.db"`,
    },
  });
}
