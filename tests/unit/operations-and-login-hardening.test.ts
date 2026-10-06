import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requestPasswordReset, resetPassword } from "@/application/account";
import type { MailDeps } from "@/application/account-mail";
import { audit } from "@/application/audit";
import { createFirstAdmin, login, storedPassword } from "@/application/auth";
import { UserError } from "@/application/errors";
import { checkSecondFactor, confirmTotpSetup, finishMfaLogin, MAX_FACTOR_FAILURES_PER_DAY, startMfaLogin, startTotpSetup } from "@/application/mfa";
import { opsTick } from "@/application/ops";
import { totpCode, totpStep } from "@/application/totp";
import { masterKeyMatches, sealForHousehold } from "@/infrastructure/crypto/vault";
import { openDb, type Db } from "@/infrastructure/db/client";
import { appUser, passkey } from "@/infrastructure/db/schema";
import { fileMailer } from "@/infrastructure/mail/mailer";
import { resetRateLimits } from "@/infrastructure/rate-limit";
import { clientIpFrom, setupCodeMatches, setupTokenMissing } from "@/server/accounts";
import { safeNext } from "@/server/auth";
import { testAccount, testHousehold } from "../accounts";

const NOW = "2026-10-05T08:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const PW = "une phrase de passe solide";
const GB = 1024 ** 3;

let db: Db;
let mailDir: string;
let mail: MailDeps;

function sent(): { to: string; subject: string; text: string }[] {
  if (!fs.existsSync(mailDir)) return [];
  return fs
    .readdirSync(mailDir)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(mailDir, f), "utf8")));
}

/** Variables d'environnement modifiées le temps d'un test. */
const savedEnv = new Map<string, string | undefined>();
function setEnv(name: string, value: string | undefined) {
  if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  db = openDb(":memory:");
  mailDir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-mail-"));
  mail = { mailer: fileMailer(mailDir), appUrl: "https://primes.exemple.ch" };
  resetRateLimits();
});

afterEach(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
});

describe("alertes d'exploitation", () => {
  const roomy = () => ({ free: 50 * GB, total: 100 * GB });

  it("préviennent les administrateurs une fois par jour quand le disque se remplit", async () => {
    createFirstAdmin(db, "admin@exemple.ch", PW, NOW);
    testHousehold(db);
    const full = () => ({ free: 5 * GB, total: 100 * GB });
    expect(await opsTick(db, { mail, disk: roomy }, NOW)).toEqual([]);
    expect(await opsTick(db, { mail, disk: full }, NOW)).toEqual(["ops:disque:2026-10-05"]);
    expect(await opsTick(db, { mail, disk: full }, "2026-10-05T09:00:00.000Z")).toEqual([]);
    expect(await opsTick(db, { mail, disk: full }, "2026-10-06T08:00:00.000Z")).toEqual(["ops:disque:2026-10-06"]);
    // Seuls les administrateurs reçoivent l'alerte (le compte de test n'a pas de courriel, l'admin si).
    expect(sent().map((m) => m.to)).toEqual(["admin@exemple.ch", "admin@exemple.ch"]);
    expect(sent()[0]!.subject).toBe("Alerte : disque presque plein");
    // Moins de 1 Go libre suffit, même sur un petit disque.
    expect(await opsTick(db, { mail, disk: () => ({ free: 0.5 * GB, total: 4 * GB }) }, "2026-10-07T08:00:00.000Z")).toEqual(["ops:disque:2026-10-07"]);
  });

  it("signalent une vague d'échecs de connexion, sans donnée personnelle", async () => {
    createFirstAdmin(db, "admin@exemple.ch", PW, NOW);
    const victim = testAccount(db);
    for (let i = 0; i < 29; i++) audit(db, victim.userId, "LOGIN_FAILED", { nowIso: "2026-10-05T07:30:00.000Z" });
    // Un échec ancien ne compte pas.
    audit(db, victim.userId, "LOGIN_FAILED", { nowIso: "2026-10-05T06:00:00.000Z" });
    expect(await opsTick(db, { mail, disk: roomy }, NOW)).toEqual([]);
    audit(db, victim.userId, "MFA_FAILED", { nowIso: "2026-10-05T07:59:00.000Z" });
    expect(await opsTick(db, { mail, disk: roomy }, NOW)).toEqual(["ops:echecs:2026-10-05"]);
    const [m] = sent();
    expect(m!.to).toBe("admin@exemple.ch");
    expect(m!.text).toContain("30 échecs");
    expect(m!.text).not.toContain("@");
  });

  it("ne font rien sans envoi de courriels ni disque lisible", async () => {
    createFirstAdmin(db, "admin@exemple.ch", PW, NOW);
    expect(await opsTick(db, { mail: null, disk: () => ({ free: 0, total: 100 * GB }) }, NOW)).toEqual([]);
    expect(await opsTick(db, { mail, disk: () => null }, NOW)).toEqual([]);
  });
});

describe("code d'installation", () => {
  it("est exigé dès qu'il est configuré, et comparé exactement", () => {
    setEnv("SETUP_TOKEN", "  code-secret ");
    expect(setupCodeMatches("code-secret")).toBe(true);
    expect(setupCodeMatches(" code-secret ")).toBe(true);
    expect(setupCodeMatches("code-secreT")).toBe(false);
    expect(setupCodeMatches(null)).toBe(false);
    expect(setupTokenMissing()).toBe(false);
  });

  it("est obligatoire sur une instance publiée en HTTPS, facultatif en local", () => {
    setEnv("SETUP_TOKEN", undefined);
    setEnv("APP_URL", "http://192.168.0.63:3001");
    expect(setupTokenMissing()).toBe(false);
    expect(setupCodeMatches(null)).toBe(true);
    setEnv("APP_URL", "https://primes.exemple.ch");
    expect(setupTokenMissing()).toBe(true);
    expect(setupCodeMatches("n'importe quoi")).toBe(false);
  });
});

describe("adresse du client et retour après connexion", () => {
  it("ne croit X-Forwarded-For que derrière un mandataire de confiance", () => {
    expect(clientIpFrom("6.6.6.6", 0)).toBe("directe");
    expect(clientIpFrom("", 0)).toBe("directe");
    expect(clientIpFrom("203.0.113.7", 1)).toBe("203.0.113.7");
    // Entrée falsifiée à gauche, ajoutée par le client : ignorée.
    expect(clientIpFrom("6.6.6.6, 203.0.113.7", 1)).toBe("203.0.113.7");
    expect(clientIpFrom("6.6.6.6, 203.0.113.7, 10.0.0.2", 2)).toBe("203.0.113.7");
    expect(clientIpFrom("", 1)).toBe("inconnue");
  });

  it("ramène une adresse IPv6 à son préfixe /64", () => {
    expect(clientIpFrom("2001:db8:85a3:12:abcd::1", 1)).toBe("2001:db8:85a3:12::/64");
    expect(clientIpFrom("2001:db8::1", 1)).toBe("2001:db8:0:0::/64");
    expect(clientIpFrom("2001:0db8:0000:0042:1:2:3:4", 1)).toBe("2001:db8:0:42::/64");
  });

  it("refuse tout retour hors de l'app", () => {
    expect(safeNext("/bilan/2027?etape=2#lettres")).toBe("/bilan/2027?etape=2#lettres");
    for (const evil of ["//evil.com", "/.//evil.com/x", "/..//evil.com", "/a/..//evil.com", "/%2e//evil.com", "/%2e%2e//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/ /evil.com", "https://evil.com", "evil.com", "/%09/evil.com\t", null, undefined]) {
      expect(safeNext(evil)).toBe("/");
    }
    // Encodé, le chemin reste local : le navigateur le lit comme un chemin.
    expect(safeNext("/%09/evil.com")).toBe("/%09/evil.com");
  });
});

describe("second facteur de l'administrateur", () => {
  it("exige la passkey quand c'est son seul second facteur", () => {
    const id = createFirstAdmin(db, "admin@exemple.ch", PW, NOW);
    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false }).kind).toBe("ok");
    db.insert(passkey).values({ id: "pk1", userId: id, publicKey: "x" }).run();
    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false })).toEqual({ kind: "passkey" });
    // Mauvais mot de passe : refus ordinaire, sans rien révéler de la passkey.
    expect(login(db, { email: "admin@exemple.ch", password: "pas le bon mot de passe" }, { nowIso: NOW, mailEnabled: false }).kind).toBe("refused");
    setEnv("ADMIN_REQUIRE_2FA", "false");
    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false }).kind).toBe("ok");
  });

  it("un simple compte avec une passkey garde la connexion par mot de passe", () => {
    createFirstAdmin(db, "admin@exemple.ch", PW, NOW);
    const user = testAccount(db);
    db.update(appUser).set({ email: "membre@exemple.ch", password: storedPassword(PW) }).where(eq(appUser.id, user.userId)).run();
    db.insert(passkey).values({ id: "pk2", userId: user.userId, publicKey: "x" }).run();
    expect(login(db, { email: "membre@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false }).kind).toBe("ok");
  });
});

/** Compte avec double facteur actif ; renvoie de quoi produire un code valable. */
function withTotp(): { userId: number; code: (ms: number) => string } {
  const userId = createFirstAdmin(db, "admin@exemple.ch", PW, NOW);
  const setup = startTotpSetup(db, userId, PW, NOW);
  const code = (ms: number) => totpCode(setup.secret, totpStep(ms));
  confirmTotpSetup(db, userId, setup.token, code(NOW_MS), NOW_MS, NOW);
  return { userId, code };
}

describe("essais de codes du double facteur", () => {
  it("sont limités par compte, même en rouvrant l'étape de connexion", () => {
    const { userId, code } = withTotp();
    const later = NOW_MS + 120_000;
    const at = new Date(later).toISOString();
    for (let i = 0; i < MAX_FACTOR_FAILURES_PER_DAY; i++) {
      const token = startMfaLogin(db, userId, at);
      expect(finishMfaLogin(db, token, "000000", later, at)).toMatchObject({ ok: false });
    }
    // Le bon code ne passe plus : le compte n'est ouvert que par passkey jusqu'au lendemain.
    const token = startMfaLogin(db, userId, at);
    expect(finishMfaLogin(db, token, code(later), later, at)).toMatchObject({ ok: false, restart: true });
    const tomorrow = later + 25 * 3600_000;
    expect(checkSecondFactor(db, userId, code(tomorrow), tomorrow, new Date(tomorrow).toISOString())).toBe("ok");
  });

  it("sur un lien de réinitialisation, cinq erreurs annulent le lien", async () => {
    withTotp();
    db.update(appUser).set({ emailVerifiedAt: NOW }).run();
    await requestPasswordReset(db, "admin@exemple.ch", mail, NOW);
    const link = /(https?:\/\/\S+)/.exec(sent().at(-1)!.text)![1]!;
    const token = new URL(link).searchParams.get("t")!;
    const deps = { mail, pwned: async () => 0 };
    const now = { iso: NOW, ms: NOW_MS + 60_000 };
    for (let i = 0; i < 4; i++) {
      await expect(resetPassword(db, { token, password: "un tout nouveau mot de passe", code: "111111" }, deps, now)).rejects.toThrow("Code du double facteur incorrect.");
    }
    await expect(resetPassword(db, { token, password: "un tout nouveau mot de passe", code: "111111" }, deps, now)).rejects.toThrow("plus valable");
    await expect(resetPassword(db, { token, password: "un tout nouveau mot de passe", code: "111111" }, deps, now)).rejects.toBeInstanceOf(UserError);
  });

  it("le code est vérifié avant la recherche du mot de passe dans les fuites", async () => {
    withTotp();
    db.update(appUser).set({ emailVerifiedAt: NOW }).run();
    await requestPasswordReset(db, "admin@exemple.ch", mail, NOW);
    const token = new URL(/(https?:\/\/\S+)/.exec(sent().at(-1)!.text)![1]!).searchParams.get("t")!;
    let lookups = 0;
    const deps = { mail, pwned: async () => (lookups++, 0) };
    await expect(resetPassword(db, { token, password: "un tout nouveau mot de passe", code: "111111" }, deps, { iso: NOW, ms: NOW_MS + 60_000 })).rejects.toThrow();
    expect(lookups).toBe(0);
  });
});

describe("point de santé et clé maître", () => {
  it("voit une base restaurée avec la mauvaise clé maître", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-cle-"));
    const file = path.join(dir, "lamal.db");
    setEnv("MASTER_KEY", undefined);
    setEnv("MASTER_KEY_FILE", undefined);
    const first = openDb(file);
    expect(masterKeyMatches(first)).toBeNull();
    const scope = testHousehold(first);
    sealForHousehold(first, scope.householdId!, "signature", "test");
    expect(masterKeyMatches(first)).toBe(true);
    first.$client.close();

    setEnv("MASTER_KEY", randomBytes(32).toString("base64"));
    const wrong = openDb(file);
    expect(masterKeyMatches(wrong)).toBe(false);
    wrong.$client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
