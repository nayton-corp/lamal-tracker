import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { signUp } from "@/application/account";
import type { MailDeps } from "@/application/account-mail";
import { householdAudit, recentAudit } from "@/application/audit";
import { confirmWithPassword, createFirstAdmin, isFreshSession, openSession, requireConfirmed } from "@/application/auth";
import { deleteAccountData, deleteOwnAccount, deletionPreview, exportForUser, inactivityTick, INACTIVITY_DAYS } from "@/application/data-rights";
import { exportReport } from "@/application/export-report";
import { resetHousehold, savePerson } from "@/application/household";
import { createHouseholdInvitation, createSignupInvitation } from "@/application/invitations";
import { confirmTotpSetup, startTotpSetup, verifySecondFactor } from "@/application/mfa";
import { createHouseholdFor, scopeForUser, type Scope } from "@/application/scope";
import { listSignatures, saveSignature } from "@/application/signatures";
import { totpCode, totpStep } from "@/application/totp";
import { sealLegacyData } from "@/infrastructure/crypto/legacy";
import { isSealed } from "@/infrastructure/crypto/vault";
import { openDb, type Db } from "@/infrastructure/db/client";
import { appUser, household, householdKey, householdMember, signature } from "@/infrastructure/db/schema";
import { fileMailer } from "@/infrastructure/mail/mailer";
import { renderReportPdf } from "@/infrastructure/pdf/report-pdf";

const NOW = "2026-10-05T08:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const PW = "une phrase de passe solide";
const at = (days: number) => new Date(NOW_MS + days * 86_400_000).toISOString();
// PNG valide de 1 × 1 pixel : rendu tel quel dans le récapitulatif PDF.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_BODY = PNG.split(",")[1]!;
const noLeaks = async () => 0;

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

/** Administrateur, et un compte invité propriétaire d'un foyer avec une personne qui a signé. */
async function setup(target: Db = db) {
  const adminId = createFirstAdmin(target, "admin@exemple.ch", PW, NOW);
  const code = createSignupInvitation(target, scopeForUser(target, adminId)!, { maxUses: 10, days: 7 }, NOW);
  const res = await signUp(target, { code, email: "proprio@exemple.ch", password: PW, consent: true }, { mail: null, pwned: noLeaks }, NOW);
  if (res.kind !== "signed-in") throw new Error("inscription");
  const hid = createHouseholdFor(target, scopeForUser(target, res.userId)!, { name: "Foyer A", street: "Rue des Tests 3", postalCode: "1003", city: "Lausanne", canton: "VD", region: 1 });
  const owner = scopeForUser(target, res.userId)!;
  const personId = savePerson(target, owner, { firstName: "Alice", lastName: "Test", birthDate: "1985-04-02" });
  saveSignature(target, owner, personId, PNG);
  return { adminId, code, hid, owner, personId };
}

async function join(code: string, email: string): Promise<Scope> {
  const res = await signUp(db, { code, email, password: PW, consent: true }, { mail: null, pwned: noLeaks }, NOW);
  if (res.kind !== "signed-in") throw new Error("inscription");
  return scopeForUser(db, res.userId)!;
}

/** Session ouverte il y a une heure : plus « fraîche », l'identité est à reconfirmer. */
function oldSession(userId: number) {
  return openSession(db, userId, "Test", at(-1 / 24)).id;
}

beforeEach(() => {
  db = openDb(":memory:");
  mailDir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-mail-"));
  mail = { mailer: fileMailer(mailDir), appUrl: "https://primes.exemple.ch" };
});

describe("chiffrement par foyer", () => {
  it("une copie de la base sans la clé maître ne permet pas de lire les signatures", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-chiffre-"));
    const file = path.join(dir, "lamal.db");
    const disk = openDb(file);
    const { owner } = await setup(disk);
    expect(listSignatures(disk, owner)[0]!.dataUrl).toBe(PNG);
    // En base, la signature est chiffrée ; la clé maître est à côté, pas dedans.
    expect(isSealed(disk.select().from(signature).get()!.dataUrl)).toBe(true);
    expect(fs.existsSync(path.join(dir, "master.key"))).toBe(true);
    const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-copie-"));
    const copy = path.join(copyDir, "lamal.db");
    await disk.$client.backup(copy);
    disk.$client.close();
    // Ni la base copiée ni son journal ne contiennent l'image en clair.
    for (const f of [file, copy]) expect(fs.readFileSync(f).includes(Buffer.from(PNG_BODY))).toBe(false);

    // Ouverte ailleurs, sans la clé : une nouvelle clé est créée, la signature reste illisible.
    const stolen = openDb(copy);
    expect(listSignatures(stolen, owner)[0]!.dataUrl).toBeNull();
    stolen.$client.close();
    // Avec la bonne clé (MASTER_KEY_FILE ou master.key recopié), tout se relit.
    fs.copyFileSync(path.join(dir, "master.key"), path.join(copyDir, "master.key"));
    const restored = openDb(copy);
    // La connexion précédente a gardé sa clé en cache : on rouvre une base neuve pour la relire.
    expect(listSignatures(restored, owner)[0]!.dataUrl).toBe(PNG);
    restored.$client.close();
  });

  it("une valeur chiffrée ne s'ouvre qu'à sa place (autre personne, autre foyer)", async () => {
    const { owner, personId, code } = await setup();
    const bobId = savePerson(db, owner, { firstName: "Bob", lastName: "Test", birthDate: "1984-01-01" });
    const sealed = db.select().from(signature).where(eq(signature.personId, personId)).get()!.dataUrl;
    db.insert(signature).values({ personId: bobId, dataUrl: sealed }).run();
    expect(listSignatures(db, owner).find((s) => s.personId === bobId)!.dataUrl).toBeNull();

    const other = await join(code, "autre@exemple.ch");
    const otherHid = createHouseholdFor(db, other, { name: "Foyer B", canton: "GE", region: 0 });
    const otherScope = scopeForUser(db, other.userId)!;
    const carolId = savePerson(db, otherScope, { firstName: "Carol", lastName: "B", birthDate: "1990-01-01" });
    db.insert(signature).values({ personId: carolId, dataUrl: sealed }).run();
    expect(otherHid).not.toBe(owner.householdId);
    expect(listSignatures(db, otherScope)[0]!.dataUrl).toBeNull();
  });

  it("chiffre au démarrage les signatures et secrets enregistrés en clair", async () => {
    const { owner, personId } = await setup();
    db.update(signature).set({ dataUrl: PNG }).where(eq(signature.personId, personId)).run();
    const setupTotp = startTotpSetup(db, owner.userId, PW, NOW);
    confirmTotpSetup(db, owner.userId, setupTotp.token, totpCode(setupTotp.secret, totpStep(NOW_MS)), NOW_MS, NOW);
    db.update(appUser).set({ totpSecret: setupTotp.secret }).where(eq(appUser.id, owner.userId)).run();

    expect(sealLegacyData(db)).toBe(2);
    expect(sealLegacyData(db)).toBe(0);
    expect(isSealed(db.select().from(signature).get()!.dataUrl)).toBe(true);
    expect(isSealed(db.select().from(appUser).where(eq(appUser.id, owner.userId)).get()!.totpSecret!)).toBe(true);
    expect(listSignatures(db, owner)[0]!.dataUrl).toBe(PNG);
    const later = NOW_MS + 90_000;
    expect(verifySecondFactor(db, owner.userId, totpCode(setupTotp.secret, totpStep(later)), later, NOW)).toBe(true);
  });

  it("supprimer le foyer supprime sa clé et ses signatures", async () => {
    const { owner, hid } = await setup();
    expect(db.select().from(householdKey).where(eq(householdKey.householdId, hid)).get()).toBeDefined();
    resetHousehold(db, owner, NOW);
    expect(db.select().from(household).where(eq(household.id, hid)).get()).toBeUndefined();
    expect(db.select().from(householdKey).all()).toHaveLength(0);
    expect(db.select().from(signature).all()).toHaveLength(0);
    expect(recentAudit(db, owner.userId).map((e) => e.kind)).toContain("HOUSEHOLD_DELETED");
  });
});

describe("confirmation de l'identité", () => {
  it("exige le mot de passe (ou une passkey) au-delà de 10 minutes de session", async () => {
    const { owner } = await setup();
    const sessionId = oldSession(owner.userId);
    expect(isFreshSession(db, sessionId, NOW)).toBe(false);
    expect(() => requireConfirmed(db, sessionId, NOW)).toThrow(/Confirmez/);
    expect(() => confirmWithPassword(db, owner.userId, sessionId, "mauvais mot de passe", NOW)).toThrow(/incorrect/);
    expect(db.select().from(appUser).where(eq(appUser.id, owner.userId)).get()!.failedLogins).toBe(1);
    confirmWithPassword(db, owner.userId, sessionId, PW, NOW);
    expect(isFreshSession(db, sessionId, at(9 / 1440))).toBe(true);
    expect(isFreshSession(db, sessionId, at(11 / 1440))).toBe(false);
  });
});

describe("export des données", () => {
  it("donne tout le foyer, déchiffré, sans aucun secret ni donnée d'un autre foyer", async () => {
    const { owner, code } = await setup();
    const other = await join(code, "autre@exemple.ch");
    const otherScope = scopeForUser(db, other.userId)!;
    createHouseholdFor(db, otherScope, { name: "Foyer B", canton: "GE", region: 0 });
    savePerson(db, scopeForUser(db, other.userId)!, { firstName: "Zoé", lastName: "Ailleurs", birthDate: "1970-01-01" });

    const sessionId = oldSession(owner.userId);
    expect(() => exportForUser(db, owner, sessionId, NOW)).toThrow(/Confirmez/);
    confirmWithPassword(db, owner.userId, sessionId, PW, NOW);
    const data = exportForUser(db, owner, sessionId, NOW);
    expect(data.compte.courriel).toBe("proprio@exemple.ch");
    expect(data.compte.consentementDonneesSanteLe).toBe(NOW);
    expect(data.foyer!.adresse.rue).toBe("Rue des Tests 3");
    expect(data.foyer!.personnes.map((p) => p.prenom)).toEqual(["Alice"]);
    expect(data.foyer!.personnes[0]!.signature!.image).toBe(PNG);

    const json = JSON.stringify(data);
    expect(json).not.toMatch(/Zoé|Ailleurs|Foyer B/);
    const user = db.select().from(appUser).where(eq(appUser.id, owner.userId)).get()!;
    expect(json).not.toContain(user.password.hash);
    expect(json).not.toContain(db.select().from(householdKey).get()!.wrappedKey);
    expect(json).not.toMatch(/"password"|"totpSecret"|"wrappedKey"|"tokenHash"/);
    expect(recentAudit(db, owner.userId).map((e) => e.kind)).toContain("DATA_EXPORTED");

    const pdf = await renderReportPdf(exportReport(data));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("suppression du compte", () => {
  it("seul dans son foyer : le foyer est supprimé avec le compte", async () => {
    const { owner, hid } = await setup();
    const sessionId = oldSession(owner.userId);
    await expect(deleteOwnAccount(db, owner, sessionId, mail, NOW)).rejects.toThrow(/Confirmez/);
    confirmWithPassword(db, owner.userId, sessionId, PW, NOW);
    expect(deletionPreview(db, owner)).toEqual({ othersInHousehold: 0, lastAdmin: false });
    expect(await deleteOwnAccount(db, owner, sessionId, mail, NOW)).toEqual({ householdDeleted: true, newOwnerId: null });
    expect(db.select().from(appUser).where(eq(appUser.id, owner.userId)).get()).toBeUndefined();
    expect(db.select().from(household).where(eq(household.id, hid)).get()).toBeUndefined();
    expect(db.select().from(householdKey).all()).toHaveLength(0);
    expect(sent().at(-1)).toMatchObject({ to: "proprio@exemple.ch", subject: "Votre compte a été supprimé" });
  });

  it("propriétaire avec un conjoint : le foyer reste, le conjoint en devient propriétaire", async () => {
    const { owner, hid } = await setup();
    const spouse = await join(createHouseholdInvitation(db, owner, NOW), "conjoint@exemple.ch");
    expect(spouse.householdRole).toBe("MEMBER");
    expect(deletionPreview(db, owner).othersInHousehold).toBe(1);
    expect(deleteAccountData(db, owner.userId, NOW)).toEqual({ householdDeleted: false, newOwnerId: spouse.userId });
    expect(scopeForUser(db, spouse.userId)).toMatchObject({ householdId: hid, householdRole: "OWNER" });
    expect(listSignatures(db, scopeForUser(db, spouse.userId)!)[0]!.dataUrl).toBe(PNG);
    expect(householdAudit(db, hid).map((e) => e.kind)).toEqual(expect.arrayContaining(["ACCOUNT_DELETED", "OWNER_TRANSFERRED"]));
  });

  it("un membre qui part ne touche pas au foyer", async () => {
    const { owner, hid } = await setup();
    const spouse = await join(createHouseholdInvitation(db, owner, NOW), "conjoint@exemple.ch");
    expect(deleteAccountData(db, spouse.userId, NOW)).toEqual({ householdDeleted: false, newOwnerId: null });
    expect(scopeForUser(db, owner.userId)).toMatchObject({ householdId: hid, householdRole: "OWNER" });
    expect(db.select().from(householdMember).all()).toHaveLength(1);
  });

  it("refuse de supprimer le seul administrateur", async () => {
    const { adminId } = await setup();
    const admin = scopeForUser(db, adminId)!;
    const sessionId = openSession(db, adminId, "Test", NOW).id;
    expect(deletionPreview(db, admin).lastAdmin).toBe(true);
    await expect(deleteOwnAccount(db, admin, sessionId, null, NOW)).rejects.toThrow(/administrateur/);
  });
});

describe("comptes inactifs", () => {
  it("deux rappels, puis suppression ; une connexion entre-temps annule tout", async () => {
    const { owner, hid, adminId } = await setup();
    const inactiveSince = NOW;
    db.update(appUser).set({ lastActiveAt: inactiveSince }).run();
    const day = (n: number) => at(n);

    expect(await inactivityTick(db, mail, day(INACTIVITY_DAYS - 31))).toEqual({ notified: 0, deleted: 0 });
    expect(await inactivityTick(db, mail, day(INACTIVITY_DAYS - 30))).toEqual({ notified: 1, deleted: 0 });
    expect(sent().at(-1)).toMatchObject({ to: "proprio@exemple.ch", subject: "Votre compte sera bientôt supprimé" });
    expect(await inactivityTick(db, mail, day(INACTIVITY_DAYS - 29))).toEqual({ notified: 0, deleted: 0 });
    expect(await inactivityTick(db, mail, day(INACTIVITY_DAYS - 7))).toEqual({ notified: 1, deleted: 0 });
    expect(await inactivityTick(db, mail, day(INACTIVITY_DAYS - 1))).toEqual({ notified: 0, deleted: 0 });
    expect(await inactivityTick(db, mail, day(INACTIVITY_DAYS))).toEqual({ notified: 0, deleted: 1 });
    expect(scopeForUser(db, owner.userId)).toBeNull();
    expect(db.select().from(household).where(eq(household.id, hid)).get()).toBeUndefined();
    // L'administrateur n'est jamais supprimé pour inactivité.
    expect(scopeForUser(db, adminId)).not.toBeNull();
  });

  it("une connexion remet le compteur à zéro ; sans courriel, rien n'est supprimé", async () => {
    const { owner } = await setup();
    db.update(appUser).set({ lastActiveAt: NOW }).run();
    await inactivityTick(db, mail, at(INACTIVITY_DAYS - 30));
    openSession(db, owner.userId, "Test", at(INACTIVITY_DAYS - 20));
    expect(db.select().from(appUser).where(eq(appUser.id, owner.userId)).get()).toMatchObject({ inactivityNotices: 0, inactivityNoticeAt: null });
    expect(await inactivityTick(db, mail, at(INACTIVITY_DAYS + 1))).toEqual({ notified: 0, deleted: 0 });
    expect(await inactivityTick(db, null, at(INACTIVITY_DAYS * 3))).toEqual({ notified: 0, deleted: 0 });
    expect(scopeForUser(db, owner.userId)).not.toBeNull();
  });
});
