import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { backupBeforeMigration, openDb, recoverInterruptedImports } from "@/infrastructure/db/client";
import { premium, tariff, tariffDataset } from "@/infrastructure/db/schema";
import { yearRetryDue } from "@/infrastructure/ofsp/retry";

describe("démarrage", () => {
  it("passe les imports interrompus en FAILED et supprime leurs primes", () => {
    const db = openDb(":memory:");
    const [stuck, active] = (["IMPORTING", "ACTIVE"] as const).map((status) =>
      db.insert(tariffDataset).values({ source: "test", fileSha256: status, status, year: 2026 }).returning().get(),
    );
    const ins = db.$client.prepare("INSERT INTO insurer (bag_number, name) VALUES (1, 'Caisse') RETURNING id").get() as { id: number };
    for (const d of [stuck!, active!]) {
      const t = db.insert(tariff).values({ datasetId: d.id, insurerId: ins.id, code: "BASE", label: "Base", typeRaw: "BASE", modelType: "STANDARD" }).returning().get();
      db.insert(premium).values({ datasetId: d.id, tariffId: t.id, canton: "VD", region: 1, ageClass: "ADULT", subgroup: "", accident: true, franchiseChf: 300, monthlyRp: 40000 }).run();
    }
    expect(recoverInterruptedImports(db)).toBe(1);
    expect(db.select().from(tariffDataset).where(eq(tariffDataset.id, stuck!.id)).get()?.status).toBe("FAILED");
    expect(db.select().from(premium).where(eq(premium.datasetId, stuck!.id)).all()).toHaveLength(0);
    expect(db.select().from(tariff).where(eq(tariff.datasetId, stuck!.id)).all()).toHaveLength(0);
    expect(db.select().from(premium).where(eq(premium.datasetId, active!.id)).all()).toHaveLength(1);
    expect(recoverInterruptedImports(db)).toBe(0);
  });

  it("sauvegarde la base avant migration et ne garde que les cinq dernières copies", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-backup-"));
    const file = path.join(dir, "lamal.db");
    const sqlite = new Database(file);
    sqlite.exec("CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (42)");
    const backups = path.join(dir, "backups");
    fs.mkdirSync(backups);
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(backups, `lamal-2000-01-0${i + 1}T00-00-00-000Z.db`), "");
    const target = backupBeforeMigration(sqlite, file);
    const copy = new Database(target, { readonly: true });
    expect(copy.prepare("SELECT x FROM t").get()).toEqual({ x: 42 });
    const kept = fs.readdirSync(backups).sort();
    expect(kept).toHaveLength(5);
    expect(kept[0]).toBe("lamal-2000-01-02T00-00-00-000Z.db");
    expect(kept.at(-1)).toBe(path.basename(target));
  });

  it("n'applique les migrations à une base existante qu'après l'avoir copiée", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-open-"));
    const file = path.join(dir, "lamal.db");
    // Copie du dossier de migrations : on y ajoutera une migration pour simuler une mise à jour.
    const migrations = path.join(dir, "drizzle");
    fs.cpSync(path.join(process.cwd(), "drizzle"), migrations, { recursive: true });
    const previous = process.env.MIGRATIONS_DIR;
    process.env.MIGRATIONS_DIR = migrations;
    try {
      openDb(file).$client.close(); // base neuve : pas de copie
      expect(fs.existsSync(path.join(dir, "backups"))).toBe(false);
      openDb(file).$client.close(); // rien en attente : pas de copie non plus
      expect(fs.existsSync(path.join(dir, "backups"))).toBe(false);
      const journalPath = path.join(migrations, "meta", "_journal.json");
      const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: { idx: number; when: number }[] };
      const last = journal.entries.at(-1)!;
      journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1, tag: "9999_test" } as never);
      fs.writeFileSync(journalPath, JSON.stringify(journal));
      fs.writeFileSync(path.join(migrations, "9999_test.sql"), "CREATE TABLE zz_test (x INTEGER);");
      const db = openDb(file);
      expect(db.$client.prepare("SELECT name FROM sqlite_master WHERE name = 'zz_test'").get()).toBeTruthy();
      db.$client.close();
      expect(fs.readdirSync(path.join(dir, "backups")).filter((n) => n.startsWith("lamal-"))).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.MIGRATIONS_DIR;
      else process.env.MIGRATIONS_DIR = previous;
    }
  });

  it("n'essaie l'archive d'une année manquante qu'une fois par jour", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    expect(yearRetryDue(null, now)).toBe(true);
    expect(yearRetryDue({ at: "2026-10-02T11:00:00Z" }, now)).toBe(false);
    expect(yearRetryDue({ at: "2026-10-01T11:59:00Z" }, now)).toBe(true);
    expect(yearRetryDue({ at: "n'importe quoi" }, now)).toBe(true);
  });
});
