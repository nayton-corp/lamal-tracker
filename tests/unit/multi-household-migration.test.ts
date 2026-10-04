import Database from "better-sqlite3";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { attemptLogin, passwordToDefine, primaryUserId, setPassword, touchSession } from "@/application/auth";
import { getHouseholdMode, getHousehold } from "@/application/household";
import { scopeForUser } from "@/application/scope";
import { openDb } from "@/infrastructure/db/client";
import { notificationLog, pushSubscription, tariffLineage } from "@/infrastructure/db/schema";

const NOW = "2026-10-05T08:00:00.000Z";
const previous = process.env.MIGRATIONS_DIR;
afterEach(() => {
  process.env.MIGRATIONS_DIR = previous;
});

/** Base telle qu'une instance d'avant les comptes l'a laissée (migrations 0000 à 0005). */
function legacyDatabase(dir: string) {
  const migrations = path.join(dir, "drizzle");
  fs.cpSync(path.join(process.cwd(), "drizzle"), migrations, { recursive: true });
  const journalPath = path.join(migrations, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const upTo = journal.entries.findIndex((e) => e.tag === "0005_letter_pingen") + 1;
  fs.writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, upTo) }));
  process.env.MIGRATIONS_DIR = migrations;
  const file = path.join(dir, "lamal.db");
  openDb(file).$client.close();
  // Le journal complet : la prochaine ouverture applique la migration des comptes.
  fs.cpSync(path.join(process.cwd(), "drizzle", "meta", "_journal.json"), journalPath);
  return file;
}

describe("migration vers plusieurs foyers", () => {
  it("fait du mot de passe de l'instance le compte administrateur, propriétaire du foyer existant", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-multi-"));
    const file = legacyDatabase(dir);
    const salt = randomBytes(16);
    const cost = 2 ** 10;
    const hash = scryptSync("ancien-mot-de-passe", salt, 32, { N: cost, r: 8, p: 1 });
    const token = "jeton-de-session";
    const sqlite = new Database(file);
    sqlite.prepare("INSERT INTO settings (key, value) VALUES ('auth.password', ?)").run(JSON.stringify({ salt: salt.toString("base64"), hash: hash.toString("base64"), cost }));
    sqlite.prepare("INSERT INTO settings (key, value) VALUES ('auth.failures', ?)").run(JSON.stringify({ count: 2, lockedUntil: null }));
    sqlite.prepare("INSERT INTO settings (key, value) VALUES ('household.mode', ?)").run(JSON.stringify("SOLO"));
    const hid = (sqlite.prepare("INSERT INTO household (name, canton, region) VALUES ('Alex Test', 'VD', 1) RETURNING id").get() as { id: number }).id;
    sqlite
      .prepare("INSERT INTO session (id, token_hash, device, expires_at) VALUES ('s1', ?, 'iPhone', '2099-01-01T00:00:00.000Z')")
      .run(createHash("sha256").update(token).digest("base64"));
    sqlite.prepare("INSERT INTO push_subscription (endpoint, keys) VALUES ('https://fcm.googleapis.com/x', ?)").run(JSON.stringify({ p256dh: "k", auth: "a" }));
    const insurerId = (sqlite.prepare("SELECT id FROM insurer LIMIT 1").get() as { id: number }).id;
    sqlite.prepare("INSERT INTO tariff_lineage (insurer_id, from_year, from_code, to_year, to_code) VALUES (?, 2026, 'A', 2027, 'B')").run(insurerId);
    sqlite.prepare("INSERT INTO notification_log (key) VALUES ('rappel-2027-J7'), ('primes-2027-3')").run();
    sqlite.close();

    const db = openDb(file);
    expect(fs.readdirSync(path.join(dir, "backups"))).toHaveLength(1);
    const userId = primaryUserId(db)!;
    const scope = scopeForUser(db, userId)!;
    expect(scope).toEqual({ userId, householdId: hid, admin: true });
    expect(attemptLogin(db, userId, "ancien-mot-de-passe", NOW)).toEqual({ ok: true });
    expect(touchSession(db, token, NOW)?.userId).toBe(userId);
    expect(getHousehold(db, scope)?.name).toBe("Alex Test");
    expect(getHouseholdMode(db, scope)).toBe("SOLO");
    expect(db.select().from(pushSubscription).get()?.userId).toBe(userId);
    expect(db.select().from(tariffLineage).get()).toMatchObject({ householdId: hid, toCode: "B" });
    expect(db.select().from(notificationLog).all().map((n) => n.key).sort()).toEqual([`h${hid}:rappel-2027-J7`, "primes-2027-3"]);
    expect(db.$client.prepare("SELECT key FROM settings WHERE key IN ('auth.password', 'auth.failures', 'household.mode')").all()).toEqual([]);

    // Mot de passe oublié (commande du README) : le compte et son foyer restent, un nouveau mot de passe est demandé.
    expect(passwordToDefine(db)).toBe(false);
    db.$client.exec(`UPDATE app_user SET password='{"salt":"","hash":"","cost":0}', failed_logins=0, locked_until=NULL WHERE role='ADMIN'; DELETE FROM session`);
    expect(passwordToDefine(db)).toBe(true);
    expect(attemptLogin(db, userId, "", NOW).ok).toBe(false);
    setPassword(db, userId, "nouveau-mot-de-passe");
    expect(passwordToDefine(db)).toBe(false);
    expect(scopeForUser(db, userId)?.householdId).toBe(hid);
    db.$client.close();
  });

  it("une instance jamais configurée reste sans compte", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-multi-"));
    const db = openDb(legacyDatabase(dir));
    expect(primaryUserId(db)).toBeNull();
    expect(passwordToDefine(db)).toBe(true);
    db.$client.close();
  });
});
