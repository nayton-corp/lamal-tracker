import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

function migrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.join(process.cwd(), "drizzle"),
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => fs.existsSync(path.join(p, "meta", "_journal.json")));
  if (!found) throw new Error(`Migrations introuvables (cherché dans ${candidates.join(", ")})`);
  return found;
}

/** Ouvre (et migre) une base. ":memory:" pour les tests. */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema }) as Db;
  migrate(db, { migrationsFolder: migrationsFolder() });
  return db;
}

const globalForDb = globalThis as unknown as { __lamalDb?: Db };

/** Connexion unique du processus (survit au rechargement à chaud en dev). */
export function getDb(): Db {
  if (!globalForDb.__lamalDb) {
    globalForDb.__lamalDb = openDb(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lamal.db"));
  }
  return globalForDb.__lamalDb;
}
