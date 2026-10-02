import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { settings } from "./schema";

export function getSetting<T>(db: Db, key: string): T | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? (row.value as T) : null;
}

export function setSetting(db: Db, key: string, value: unknown) {
  db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}
