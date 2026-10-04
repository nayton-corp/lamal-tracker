import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { householdKey } from "../db/schema";

/*
 * Chiffrement des données les plus sensibles (signatures dessinées, secrets du double facteur).
 *
 * Chaque foyer a sa propre clé AES-256-GCM, gardée en base chiffrée par la clé maître. La clé
 * maître ne vit jamais dans la base : variable MASTER_KEY, fichier MASTER_KEY_FILE (secret Docker),
 * ou à défaut un fichier `master.key` créé à côté de la base. Une copie de la base seule ne
 * suffit donc pas à lire ces données ; supprimer un foyer supprime sa clé.
 *
 * Format d'une valeur chiffrée : « v1. » + base64url(nonce 12 octets | chiffré | tag 16 octets).
 * Le contexte (foyer, table, ligne) est authentifié : une valeur recopiée ailleurs ne s'ouvre pas.
 */

const PREFIX = "v1.";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export const isSealed = (value: string) => value.startsWith(PREFIX);

export function seal(key: Buffer, plaintext: string, context: string): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([nonce, body, cipher.getAuthTag()]).toString("base64url");
}

/** Déchiffre ; lève une erreur si la clé, le contexte ou la valeur ne correspondent pas. */
export function unseal(key: Buffer, sealed: string, context: string): string {
  if (!isSealed(sealed)) throw new Error("Valeur non chiffrée");
  const raw = Buffer.from(sealed.slice(PREFIX.length), "base64url");
  if (raw.length < NONCE_BYTES + TAG_BYTES) throw new Error("Valeur chiffrée tronquée");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, NONCE_BYTES));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(NONCE_BYTES, raw.length - TAG_BYTES)), decipher.final()]).toString("utf8");
}

/** 32 octets en hexadécimal (64 caractères) ou en base64. */
export function parseMasterKey(text: string, origin: string): Buffer {
  const t = text.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(t) ? Buffer.from(t, "hex") : Buffer.from(t, "base64");
  if (key.length !== KEY_BYTES) throw new Error(`${origin} : la clé maître doit faire 32 octets (64 caractères hexadécimaux ou 44 en base64). Générez-en une avec « openssl rand -base64 32 ».`);
  return key;
}

const masterKeys = new WeakMap<object, Buffer>();

/** Fichier de clé par défaut : à côté de la base. */
export function defaultKeyFile(dbFile: string): string {
  return path.join(path.dirname(dbFile), "master.key");
}

/**
 * Clé maître de cette base. Base en mémoire (tests) : une clé aléatoire, propre à la connexion.
 * Sinon MASTER_KEY, puis MASTER_KEY_FILE, puis `master.key` à côté de la base (créé au besoin).
 */
export function masterKey(db: Db, env: Record<string, string | undefined> = process.env): Buffer {
  const client = db.$client;
  const cached = masterKeys.get(client);
  if (cached) return cached;
  let key: Buffer;
  if (env.MASTER_KEY?.trim()) key = parseMasterKey(env.MASTER_KEY, "MASTER_KEY");
  else if (env.MASTER_KEY_FILE?.trim()) key = parseMasterKey(fs.readFileSync(env.MASTER_KEY_FILE.trim(), "utf8"), "MASTER_KEY_FILE");
  else if (client.memory) key = randomBytes(KEY_BYTES);
  else {
    const file = defaultKeyFile(client.name);
    if (fs.existsSync(file)) key = parseMasterKey(fs.readFileSync(file, "utf8"), file);
    else {
      key = randomBytes(KEY_BYTES);
      // « wx » : jamais d'écrasement d'une clé existante (deux processus au démarrage).
      try {
        fs.writeFileSync(file, key.toString("base64") + "\n", { mode: 0o600, flag: "wx" });
        console.warn(`[chiffrement] clé maître créée : ${file}. Gardez-en une copie hors du serveur : sans elle, les signatures enregistrées sont perdues.`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        key = parseMasterKey(fs.readFileSync(file, "utf8"), file);
      }
    }
  }
  masterKeys.set(client, key);
  return key;
}

/** Clé de données du foyer, créée à la première écriture. Null si elle n'existe pas (ou plus). */
function dataKey(db: Db, householdId: number, create: boolean): Buffer | null {
  const master = masterKey(db);
  const context = `household-key:${householdId}`;
  const row = db.select().from(householdKey).where(eq(householdKey.householdId, householdId)).get();
  if (row) return Buffer.from(unseal(master, row.wrappedKey, context), "base64");
  if (!create) return null;
  const key = randomBytes(KEY_BYTES);
  db.insert(householdKey).values({ householdId, wrappedKey: seal(master, key.toString("base64"), context) }).onConflictDoNothing().run();
  // Une autre écriture a pu créer la clé entre-temps : on relit celle qui est en base.
  return dataKey(db, householdId, false);
}

const householdContext = (householdId: number, context: string) => `h${householdId}|${context}`;

export function sealForHousehold(db: Db, householdId: number, plaintext: string, context: string): string {
  return seal(dataKey(db, householdId, true)!, plaintext, householdContext(householdId, context));
}

let warned = false;

/** Valeur déchiffrée, ou null si elle est illisible (clé maître différente, valeur altérée). */
export function openForHousehold(db: Db, householdId: number, sealed: string, context: string): string | null {
  try {
    const key = dataKey(db, householdId, false);
    return key ? unseal(key, sealed, householdContext(householdId, context)) : null;
  } catch {
    if (!warned) {
      warned = true;
      console.error("[chiffrement] donnée illisible : la clé maître ne correspond pas à celle qui l'a chiffrée (MASTER_KEY, MASTER_KEY_FILE ou master.key).");
    }
    return null;
  }
}

/**
 * La clé maître ouvre-t-elle les clés de foyer de cette base ? Null s'il n'y en a encore aucune.
 * Sert au point de santé : une base restaurée avec la mauvaise clé se voit tout de suite.
 */
export function masterKeyMatches(db: Db): boolean | null {
  const row = db.select().from(householdKey).limit(1).get();
  if (!row) return null;
  try {
    unseal(masterKey(db), row.wrappedKey, `household-key:${row.householdId}`);
    return true;
  } catch {
    return false;
  }
}

/** Secret d'un compte (double facteur), chiffré directement par la clé maître. */
export function sealSecret(db: Db, plaintext: string, context: string): string {
  return seal(masterKey(db), plaintext, context);
}

export function openSecret(db: Db, sealed: string, context: string): string | null {
  if (!isSealed(sealed)) return sealed;
  try {
    return unseal(masterKey(db), sealed, context);
  } catch {
    return null;
  }
}
