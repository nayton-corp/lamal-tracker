import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupDatabase } from "@/infrastructure/db/client";
import { app } from "@/server/app";

/** Télécharge une copie cohérente de la base SQLite (sauvegarde à chaud). */
export async function GET() {
  const ctx = app();
  const tmp = path.join(os.tmpdir(), `lamal-backup-${Date.now()}.sqlite`);
  try {
    await backupDatabase(ctx.db, tmp);
    const bytes = fs.readFileSync(tmp);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="lamal-tracker-${ctx.clock.today()}.sqlite"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
