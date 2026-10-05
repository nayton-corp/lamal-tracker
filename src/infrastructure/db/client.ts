import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq, inArray } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { premium, tariff, tariffDataset } from "./schema";
import { seedReference } from "./seed";
import { sealLegacyData } from "../crypto/legacy";

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

/** Nombre de migrations du journal pas encore appliquées à cette base. */
function pendingMigrations(sqlite: Database.Database, folder: string): number {
  const journal = JSON.parse(fs.readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
  const table = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'").get();
  const applied = table ? (sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n : 0;
  return Math.max(0, journal.entries.length - applied);
}

const BACKUPS_KEPT = 5;
/**
 * Durée de vie d'une copie d'avant migration. Elle contient les comptes supprimés depuis : passé
 * ce délai (le même que la sauvegarde continue), elle est effacée, comme annoncé dans la page de
 * confidentialité.
 */
const BACKUP_MAX_AGE_DAYS = 30;

/** Efface les copies d'avant migration de plus de `BACKUP_MAX_AGE_DAYS` jours. */
export function pruneOldBackups(file: string, nowMs = Date.now()) {
  const dir = path.join(path.dirname(file), "backups");
  if (!fs.existsSync(dir)) return;
  for (const n of fs.readdirSync(dir).filter((name) => /^lamal-.*\.db$/.test(name))) {
    const full = path.join(dir, n);
    if (nowMs - fs.statSync(full).mtimeMs > BACKUP_MAX_AGE_DAYS * 86_400_000) fs.rmSync(full, { force: true });
  }
}

/**
 * Copie cohérente de la base dans `<dossier>/backups/` (VACUUM INTO, synchrone) avant une
 * migration ; les cinq dernières copies sont conservées. Retourne le chemin de la copie.
 */
export function backupBeforeMigration(sqlite: Database.Database, file: string): string {
  const dir = path.join(path.dirname(file), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `lamal-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  sqlite.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const old = fs
    .readdirSync(dir)
    .filter((n) => /^lamal-.*\.db$/.test(n))
    .sort()
    .slice(0, -BACKUPS_KEPT);
  for (const n of old) fs.rmSync(path.join(dir, n), { force: true });
  return target;
}

/**
 * Un import interrompu (coupure, redémarrage) laisse un jeu IMPORTING avec des primes partielles :
 * au démarrage, il passe FAILED et ses primes/tarifs sont supprimés. Retourne le nombre de jeux.
 */
export function recoverInterruptedImports(db: Db): number {
  const stuck = db.select({ id: tariffDataset.id }).from(tariffDataset).where(eq(tariffDataset.status, "IMPORTING")).all().map((r) => r.id);
  if (stuck.length === 0) return 0;
  db.transaction((tx) => {
    tx.delete(premium).where(inArray(premium.datasetId, stuck)).run();
    tx.delete(tariff).where(inArray(tariff.datasetId, stuck)).run();
    tx.update(tariffDataset).set({ status: "FAILED" }).where(inArray(tariffDataset.id, stuck)).run();
  });
  return stuck.length;
}

/** Ouvre (et migre) une base. ":memory:" pour les tests. */
export function openDb(file: string): Db {
  const onDisk = file !== ":memory:";
  if (onDisk) fs.mkdirSync(path.dirname(file), { recursive: true });
  const existed = onDisk && fs.existsSync(file);
  if (onDisk) pruneOldBackups(file);
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  // Une ligne supprimée (compte, foyer) est effacée du fichier, pas seulement marquée libre.
  sqlite.pragma("secure_delete = ON");
  const db = drizzle(sqlite, { schema }) as Db;
  const folder = migrationsFolder();
  let backup: string | null = null;
  if (existed && pendingMigrations(sqlite, folder) > 0) {
    backup = backupBeforeMigration(sqlite, file);
    console.log(`[db] sauvegarde avant migration : ${backup}`);
  }
  try {
    migrate(db, { migrationsFolder: folder });
  } catch (error) {
    console.error(
      `[db] ÉCHEC de la migration du schéma. La base n'a pas été modifiée (transaction annulée)` +
        (backup ? ` et une copie d'avant migration se trouve dans ${backup}` : "") +
        `. Revenez à l'image précédente (tag sha-…) ou restaurez cette copie dans data/lamal.db.`,
    );
    throw error;
  }
  const recovered = recoverInterruptedImports(db);
  if (recovered > 0) console.warn(`[db] ${recovered} import(s) interrompu(s) marqué(s) FAILED et nettoyé(s).`);
  // Base au schéma partiel (tests de migration avec un journal tronqué) : rien à chiffrer encore.
  const encrypted = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'household_key'").get() !== undefined;
  const sealed = encrypted ? sealLegacyData(db) : 0;
  if (sealed > 0) {
    // Les anciennes valeurs en clair ne doivent pas survivre dans le journal WAL.
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    console.log(`[chiffrement] ${sealed} donnée(s) enregistrée(s) en clair désormais chiffrée(s).`);
  }
  seedReference(db, new Date().getFullYear());
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
