import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export function migrationsFolder(): string {
  return process.env.MIGRATIONS_PATH ?? path.join(process.cwd(), "drizzle");
}

/** Ouvre une base SQLite, applique les PRAGMA et les migrations. `:memory:` pour les tests. */
export function openDatabase(file: string): Db {
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

export function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data");
}

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? path.join(/*turbopackIgnore: true*/ dataDir(), "lamal.sqlite");
}

const globalForDb = globalThis as unknown as { __lamalDb?: Db };

/** Connexion partagée du serveur (survit au rechargement à chaud en développement). */
export function getDb(): Db {
  if (!globalForDb.__lamalDb) globalForDb.__lamalDb = openDatabase(databasePath());
  return globalForDb.__lamalDb;
}

/** Sauvegarde à chaud cohérente (API backup de SQLite). */
export async function backupDatabase(db: Db, destination: string): Promise<void> {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await db.$client.backup(destination);
}
