import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { confirmEmail, requestEmailChange, requestPasswordReset, resetInfo, resetPassword, signUp, type AccountDeps } from "@/application/account";
import type { MailDeps } from "@/application/account-mail";
import { listAccounts, pingenAllowed, setAccountDisabled, setPingenAllowed } from "@/application/admin";
import {
  adminNeedsFactor,
  changePassword,
  createFirstAdmin,
  login,
  openSession,
  rememberDevice,
  touchSession,
} from "@/application/auth";
import { UserError } from "@/application/errors";
import { resetHousehold } from "@/application/household";
import {
  createHouseholdInvitation,
  createSignupInvitation,
  householdMembers,
  leaveHousehold,
  listHouseholdInvitations,
  removeMember,
  revokeInvitation,
} from "@/application/invitations";
import { confirmTotpSetup, disableTotp, finishMfaLogin, recoveryCodesLeft, startMfaLogin, startTotpSetup } from "@/application/mfa";
import { createHouseholdFor, scopeForUser, type Scope } from "@/application/scope";
import { base32Encode, totpCode, totpStep, verifyTotp } from "@/application/totp";
import { openDb, type Db } from "@/infrastructure/db/client";
import { appUser } from "@/infrastructure/db/schema";
import { eq } from "drizzle-orm";
import { scryptSync } from "node:crypto";
import { pwnedCount } from "@/infrastructure/hibp";
import { fileMailer } from "@/infrastructure/mail/mailer";
import { consume, resetRateLimits } from "@/infrastructure/rate-limit";

const NOW = "2026-10-05T08:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const PW = "une phrase de passe solide";
const later = (minutes: number) => new Date(NOW_MS + minutes * 60_000).toISOString();

let db: Db;
let mailDir: string;
let mail: MailDeps;
let deps: AccountDeps;
const noLeaks = async () => 0;

/** Courriels « envoyés » (fichiers JSON du transport de test), du plus ancien au plus récent. */
function sent(): { to: string; subject: string; text: string }[] {
  if (!fs.existsSync(mailDir)) return [];
  return fs
    .readdirSync(mailDir)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(mailDir, f), "utf8")));
}
const lastLink = () => /(https?:\/\/\S+)/.exec(sent().at(-1)!.text)![1]!;
const tokenOf = (link: string) => new URL(link).searchParams.get("t")!;

function admin(): Scope {
  const id = createFirstAdmin(db, "admin@exemple.ch", PW, NOW);
  return scopeForUser(db, id)!;
}

async function newUser(email: string, code: string): Promise<number> {
  const res = await signUp(db, { code, email, password: PW, consent: true }, { mail: null, pwned: noLeaks }, NOW);
  if (res.kind !== "signed-in") throw new Error("inscription");
  return res.userId;
}

beforeEach(() => {
  db = openDb(":memory:");
  mailDir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-mail-"));
  mail = { mailer: fileMailer(mailDir), appUrl: "https://primes.exemple.ch" };
  deps = { mail, pwned: noLeaks };
  resetRateLimits();
});

describe("TOTP", () => {
  it("suit le vecteur de test de la RFC 6238 et refuse un code déjà utilisé", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpCode(secret, totpStep(59_000))).toBe("287082");
    expect(totpCode(secret, totpStep(1_111_111_109_000))).toBe("081804");
    const step = verifyTotp(secret, "287082", 59_000, null);
    expect(step).toBe(1);
    expect(verifyTotp(secret, "287082", 59_000, step)).toBeNull();
    expect(verifyTotp(secret, "12345", 59_000, null)).toBeNull();
  });
});

describe("connexion", () => {
  it("ne révèle pas si le compte existe, verrouille après 5 échecs, refuse un compte suspendu", () => {
    const a = admin();
    const refused = { kind: "refused", lockedSeconds: 0 };
    expect(login(db, { email: "personne@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: true })).toEqual(refused);
    expect(login(db, { email: "pas-un-courriel", password: PW }, { nowIso: NOW, mailEnabled: true })).toEqual(refused);
    expect(login(db, { email: "", password: PW }, { nowIso: NOW, mailEnabled: true })).toEqual(refused);
    expect(login(db, { email: " Admin@Exemple.ch ", password: PW }, { nowIso: NOW, mailEnabled: true })).toEqual({ kind: "ok", userId: a.userId });
    for (let i = 0; i < 4; i++) login(db, { email: "admin@exemple.ch", password: "faux" }, { nowIso: NOW, mailEnabled: true });
    const locked = login(db, { email: "admin@exemple.ch", password: "faux" }, { nowIso: NOW, mailEnabled: true });
    expect(locked).toMatchObject({ kind: "refused" });
    expect((locked as { lockedSeconds: number }).lockedSeconds).toBeGreaterThan(0);
    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: true }).kind).toBe("refused");
    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: later(2), mailEnabled: true }).kind).toBe("ok");
  });

  it("limite une session à 90 jours, même utilisée chaque jour", () => {
    const a = admin();
    const { token } = openSession(db, a.userId, "test", NOW);
    for (let day = 1; day < 90; day += 20) expect(touchSession(db, token, later(day * 1440))).not.toBeNull();
    expect(touchSession(db, token, later(90 * 1440 + 1))).toBeNull();
  });

  it("exige un second facteur de l'administrateur, pas des autres", () => {
    const a = admin();
    expect(adminNeedsFactor(db, a.userId, {})).toBe(true);
    expect(adminNeedsFactor(db, a.userId, { ADMIN_REQUIRE_2FA: "false" })).toBe(false);
  });

  it("signale un nouvel appareil, pas le premier ni un appareil connu", () => {
    const a = admin();
    expect(rememberDevice(db, a.userId, "appareil-1", NOW)).toEqual({ alert: false });
    expect(rememberDevice(db, a.userId, "appareil-1", NOW)).toEqual({ alert: false });
    expect(rememberDevice(db, a.userId, "appareil-2", NOW)).toEqual({ alert: true });
  });

  it("refuse un nouveau mot de passe trop court ou présent dans une fuite, et déconnecte les autres appareils", async () => {
    const a = admin();
    const keep = openSession(db, a.userId, "ici", NOW);
    const other = openSession(db, a.userId, "ailleurs", NOW);
    await expect(changePassword(db, a.userId, PW, "court", noLeaks, keep.id, NOW)).rejects.toThrow(/12 caractères/);
    await expect(changePassword(db, a.userId, PW, "motdepasse123", async () => 3, keep.id, NOW)).rejects.toThrow(/fuites/);
    await changePassword(db, a.userId, PW, "un tout nouveau mot de passe", noLeaks, keep.id, NOW);
    expect(touchSession(db, keep.token, NOW)).not.toBeNull();
    expect(touchSession(db, other.token, NOW)).toBeNull();
  });
});

describe("inscription sur invitation", () => {
  it("exige un code valable et le consentement ; une invitation à usage unique ne sert qu'une fois", async () => {
    const a = admin();
    const code = createSignupInvitation(db, a, { label: "Famille Test", maxUses: 1, days: 7 }, NOW);
    const input = { code, email: "alex@exemple.ch", password: PW, consent: true };
    await expect(signUp(db, { ...input, code: "faux" }, deps, NOW)).rejects.toThrow(/invitation/);
    await expect(signUp(db, { ...input, consent: false }, deps, NOW)).rejects.toThrow(/accord/);
    await expect(signUp(db, input, deps, later(8 * 1440))).rejects.toThrow(/invitation/);
    expect(await signUp(db, input, deps, NOW)).toEqual({ kind: "check-mail" });
    await expect(signUp(db, { ...input, email: "autre@exemple.ch" }, deps, NOW)).rejects.toThrow(/invitation/);
  });

  it("confirme l'adresse par un lien à usage unique avant la première connexion", async () => {
    const a = admin();
    const code = createSignupInvitation(db, a, { maxUses: 5, days: 7 }, NOW);
    await signUp(db, { code, email: "Alex@Exemple.ch", password: PW, consent: true }, deps, NOW);
    expect(sent().at(-1)).toMatchObject({ to: "alex@exemple.ch", subject: "Confirmez votre adresse" });
    const token = tokenOf(lastLink());
    expect(lastLink()).toMatch(/^https:\/\/primes\.exemple\.ch\/verifier\?t=/);
    expect(login(db, { email: "alex@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: true }).kind).toBe("unverified");
    const { userId, autoLogin, previousEmail } = confirmEmail(db, token, NOW);
    // Première confirmation, juste après l'inscription : la personne est connectée directement.
    expect({ autoLogin, previousEmail }).toEqual({ autoLogin: true, previousEmail: null });
    expect(() => confirmEmail(db, token, NOW)).toThrow(UserError);
    expect(login(db, { email: "alex@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: true })).toEqual({ kind: "ok", userId });
    // Le nouveau compte n'a pas de foyer et n'est pas administrateur.
    expect(scopeForUser(db, userId)).toEqual({ userId, householdId: null, householdRole: null, admin: false });
  });

  it("refait au coût actuel une empreinte ancienne, à la connexion", () => {
    const a = admin();
    const salt = Buffer.alloc(16, 1);
    const old = { salt: salt.toString("base64"), hash: scryptSync(PW, salt, 32, { N: 2 ** 14, r: 8, p: 1 }).toString("base64"), cost: 2 ** 14 };
    db.update(appUser).set({ password: old }).where(eq(appUser.id, a.userId)).run();
    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false }).kind).toBe("ok");
    expect(db.select().from(appUser).where(eq(appUser.id, a.userId)).get()!.password.cost).toBe(2 ** 16);
    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false }).kind).toBe("ok");
  });

  it("un lien de confirmation ancien n'ouvre pas de session", async () => {
    const a = admin();
    const code = createSignupInvitation(db, a, { maxUses: 1, days: 7 }, NOW);
    await signUp(db, { code, email: "tard@exemple.ch", password: PW, consent: true }, deps, NOW);
    expect(confirmEmail(db, tokenOf(lastLink()), later(60)).autoLogin).toBe(false);
  });

  it("ne révèle pas une adresse déjà inscrite et ne consomme pas l'invitation", async () => {
    const a = admin();
    const code = createSignupInvitation(db, a, { maxUses: 1, days: 7 }, NOW);
    expect(await signUp(db, { code, email: "admin@exemple.ch", password: PW, consent: true }, deps, NOW)).toEqual({ kind: "check-mail" });
    expect(sent().at(-1)).toMatchObject({ to: "admin@exemple.ch", subject: "Vous avez déjà un compte" });
    expect(await signUp(db, { code, email: "neuf@exemple.ch", password: PW, consent: true }, deps, NOW)).toEqual({ kind: "check-mail" });
  });

  it("sans courriels configurés, ouvre le compte tout de suite", async () => {
    const a = admin();
    const code = createSignupInvitation(db, a, { maxUses: 1, days: 7 }, NOW);
    const userId = await newUser("alex@exemple.ch", code);
    expect(login(db, { email: "alex@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false })).toEqual({ kind: "ok", userId });
  });
});

describe("réinitialisation du mot de passe", () => {
  it("n'envoie rien pour une adresse inconnue ; le lien sert une fois et ferme toutes les sessions", async () => {
    const a = admin();
    const session = openSession(db, a.userId, "ici", NOW);
    await requestPasswordReset(db, "inconnu@exemple.ch", mail, NOW);
    expect(sent()).toHaveLength(0);
    await requestPasswordReset(db, "admin@exemple.ch", mail, NOW);
    const token = tokenOf(lastLink());
    expect(resetInfo(db, token, NOW)).toEqual({ needsCode: false });
    expect(resetInfo(db, token, later(61))).toBeNull();
    await resetPassword(db, { token, password: "le nouveau mot de passe" }, deps, { iso: NOW, ms: NOW_MS });
    expect(sent().at(-1)?.subject).toBe("Votre mot de passe a été changé");
    expect(touchSession(db, session.token, NOW)).toBeNull();
    await expect(resetPassword(db, { token, password: "encore un autre mot" }, deps, { iso: NOW, ms: NOW_MS })).rejects.toThrow(/plus valable/);
    expect(login(db, { email: "admin@exemple.ch", password: "le nouveau mot de passe" }, { nowIso: NOW, mailEnabled: true }).kind).toBe("ok");
  });

  it("garde le double facteur exigé après la réinitialisation", async () => {
    const a = admin();
    const setup = startTotpSetup(db, a.userId, PW, NOW);
    confirmTotpSetup(db, a.userId, setup.token, totpCode(setup.secret, totpStep(NOW_MS)), NOW_MS, NOW);
    await requestPasswordReset(db, "admin@exemple.ch", mail, NOW);
    const token = tokenOf(lastLink());
    expect(resetInfo(db, token, NOW)).toEqual({ needsCode: true });
    await expect(resetPassword(db, { token, password: "le nouveau mot de passe", code: "000000" }, deps, { iso: NOW, ms: NOW_MS })).rejects.toThrow(/double facteur/);
    const next = NOW_MS + 30_000;
    await resetPassword(db, { token, password: "le nouveau mot de passe", code: totpCode(setup.secret, totpStep(next)) }, deps, { iso: NOW, ms: next });
  });
});

describe("double facteur", () => {
  it("s'active avec un premier code, puis la connexion demande un code ou un code de secours (une fois)", () => {
    const a = admin();
    expect(() => startTotpSetup(db, a.userId, "faux", NOW)).toThrow(/Mot de passe/);
    const setup = startTotpSetup(db, a.userId, PW, NOW);
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\/Primes%20LAMal%3Aadmin%40exemple\.ch\?secret=/);
    expect(() => confirmTotpSetup(db, a.userId, setup.token, "000000", NOW_MS, NOW)).toThrow(/Code incorrect/);
    const codes = confirmTotpSetup(db, a.userId, setup.token, totpCode(setup.secret, totpStep(NOW_MS)), NOW_MS, NOW);
    expect(codes).toHaveLength(10);
    expect(adminNeedsFactor(db, a.userId, {})).toBe(false);

    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false })).toEqual({ kind: "mfa", userId: a.userId });
    const pending = startMfaLogin(db, a.userId, NOW);
    expect(finishMfaLogin(db, pending, "000000", NOW_MS, NOW)).toMatchObject({ ok: false, restart: false });
    expect(finishMfaLogin(db, pending, codes[0]!.toUpperCase(), NOW_MS, NOW)).toEqual({ ok: true, userId: a.userId });
    expect(finishMfaLogin(db, pending, codes[1]!, NOW_MS, NOW)).toMatchObject({ ok: false, restart: true });
    const again = startMfaLogin(db, a.userId, NOW);
    expect(finishMfaLogin(db, again, codes[0]!, NOW_MS, NOW)).toMatchObject({ ok: false });
    expect(recoveryCodesLeft(db, a.userId)).toBe(9);
  });

  it("abandonne l'étape après 5 codes erronés", () => {
    const a = admin();
    const setup = startTotpSetup(db, a.userId, PW, NOW);
    confirmTotpSetup(db, a.userId, setup.token, totpCode(setup.secret, totpStep(NOW_MS)), NOW_MS, NOW);
    const pending = startMfaLogin(db, a.userId, NOW);
    for (let i = 0; i < 4; i++) expect(finishMfaLogin(db, pending, "000000", NOW_MS, NOW)).toMatchObject({ restart: false });
    expect(finishMfaLogin(db, pending, "000000", NOW_MS, NOW)).toMatchObject({ restart: true });
    expect(finishMfaLogin(db, pending, totpCode(setup.secret, totpStep(NOW_MS) + 1), NOW_MS, NOW)).toMatchObject({ ok: false, restart: true });
  });

  it("ne laisse pas l'administrateur sans second facteur", () => {
    const a = admin();
    const setup = startTotpSetup(db, a.userId, PW, NOW);
    confirmTotpSetup(db, a.userId, setup.token, totpCode(setup.secret, totpStep(NOW_MS)), NOW_MS, NOW);
    expect(() => disableTotp(db, a.userId, PW, NOW)).toThrow(/second facteur/);
  });
});

describe("foyer partagé", () => {
  async function setup() {
    const a = admin();
    const code = createSignupInvitation(db, a, { maxUses: 5, days: 7 }, NOW);
    const ownerId = await newUser("proprio@exemple.ch", code);
    const hid = createHouseholdFor(db, scopeForUser(db, ownerId)!, { name: "Foyer A", canton: "VD", region: 1 });
    const owner = scopeForUser(db, ownerId)!;
    const invite = createHouseholdInvitation(db, owner, NOW);
    const memberId = await newUser("conjoint@exemple.ch", invite);
    return { a, code, hid, owner, member: scopeForUser(db, memberId)! };
  }

  it("le conjoint invité rejoint le foyer comme membre ; le lien ne sert qu'une fois", async () => {
    const { code, hid, owner, member } = await setup();
    expect(member).toMatchObject({ householdId: hid, householdRole: "MEMBER", admin: false });
    expect(householdMembers(db, owner).map((m) => [m.email, m.role])).toEqual([
      ["proprio@exemple.ch", "OWNER"],
      ["conjoint@exemple.ch", "MEMBER"],
    ]);
    const invite = createHouseholdInvitation(db, owner, NOW);
    expect(listHouseholdInvitations(db, owner, NOW)).toHaveLength(1);
    await newUser("troisieme@exemple.ch", invite);
    await expect(newUser("quatrieme@exemple.ch", invite)).rejects.toThrow(/invitation/);
    // Un lien de foyer expire après 48 heures.
    const late = createHouseholdInvitation(db, owner, NOW);
    await expect(signUp(db, { code: late, email: "tard@exemple.ch", password: PW, consent: true }, { mail: null, pwned: noLeaks }, later(49 * 60))).rejects.toThrow(/invitation/);
    expect(code).toBeTruthy();
  });

  it("réserve invitations, retrait et remise à zéro au propriétaire", async () => {
    const { owner, member } = await setup();
    expect(() => createHouseholdInvitation(db, member, NOW)).toThrow(/propriétaire/);
    expect(() => removeMember(db, member, owner.userId, NOW)).toThrow(/propriétaire/);
    expect(() => resetHousehold(db, member)).toThrow(/propriétaire/);
    expect(() => leaveHousehold(db, owner, NOW)).toThrow(/propriétaire/);
    removeMember(db, owner, member.userId, NOW);
    expect(scopeForUser(db, member.userId)).toMatchObject({ householdId: null, householdRole: null });
  });

  it("un autre foyer ne peut ni révoquer les invitations ni retirer les membres", async () => {
    const { a, code, owner, member } = await setup();
    const otherId = await newUser("autre@exemple.ch", code);
    const otherHid = createHouseholdFor(db, scopeForUser(db, otherId)!, { name: "Foyer B", canton: "GE", region: 0 });
    const other = scopeForUser(db, otherId)!;
    expect(other.householdId).toBe(otherHid);
    createHouseholdInvitation(db, owner, NOW);
    const [pending] = listHouseholdInvitations(db, owner, NOW);
    expect(() => revokeInvitation(db, other, pending!.id, NOW)).toThrow(/introuvable/);
    expect(() => removeMember(db, other, member.userId, NOW)).toThrow(/introuvable/);
    expect(() => listAccounts(db, other)).toThrow(/administrateur/);
    expect(() => setPingenAllowed(db, other, otherHid, true)).toThrow(/administrateur/);
    // L'administrateur, lui, peut révoquer une invitation d'inscription mais pas celle d'un foyer.
    expect(() => revokeInvitation(db, a, pending!.id, NOW)).toThrow(/introuvable/);
  });
});

describe("administration", () => {
  it("suspend un compte (sessions fermées) et ouvre Pingen foyer par foyer", async () => {
    const a = admin();
    const code = createSignupInvitation(db, a, { maxUses: 2, days: 7 }, NOW);
    const userId = await newUser("alex@exemple.ch", code);
    const hid = createHouseholdFor(db, scopeForUser(db, userId)!, { name: "Foyer", canton: "VD", region: 1 });
    const scope = scopeForUser(db, userId)!;
    const { token } = openSession(db, userId, "ici", NOW);
    expect(pingenAllowed(db, scope)).toBe(false);
    setPingenAllowed(db, a, hid, true);
    expect(pingenAllowed(db, scope)).toBe(true);
    expect(listAccounts(db, a).find((x) => x.id === userId)).toMatchObject({ email: "alex@exemple.ch", householdId: hid, pingen: true, disabled: false });
    expect(() => setAccountDisabled(db, a, a.userId, true, NOW)).toThrow(/propre compte/);
    setAccountDisabled(db, a, userId, true, NOW);
    expect(touchSession(db, token, NOW)).toBeNull();
    expect(scopeForUser(db, userId)).toBeNull();
    expect(login(db, { email: "alex@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false }).kind).toBe("refused");
    setAccountDisabled(db, a, userId, false, NOW);
    expect(login(db, { email: "alex@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: false }).kind).toBe("ok");
  });

  it("change l'adresse seulement après confirmation de la nouvelle", async () => {
    const a = admin();
    expect(await requestEmailChange(db, a.userId, { email: "neuve@exemple.ch", password: PW }, mail, NOW)).toBe("sent");
    expect(sent().at(-1)?.to).toBe("neuve@exemple.ch");
    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: true }).kind).toBe("ok");
    // Un changement d'adresse ne connecte jamais : l'ancienne adresse est prévenue.
    expect(confirmEmail(db, tokenOf(lastLink()), NOW)).toMatchObject({ autoLogin: false, previousEmail: "admin@exemple.ch" });
    expect(login(db, { email: "neuve@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: true }).kind).toBe("ok");
    expect(login(db, { email: "admin@exemple.ch", password: PW }, { nowIso: NOW, mailEnabled: true }).kind).toBe("refused");
  });
});

describe("infrastructure", () => {
  it("garde en mémoire une empreinte courte des clés démesurées", () => {
    const huge = `login-email:${"x".repeat(1_000_000)}`;
    for (let i = 0; i < 2; i++) expect(consume(huge, 2, 1000, 0)).toBe(true);
    expect(consume(huge, 2, 1000, 0)).toBe(false);
  });

  it("limite le débit par fenêtre", () => {
    for (let i = 0; i < 3; i++) expect(consume("k", 3, 1000, 0)).toBe(true);
    expect(consume("k", 3, 1000, 10)).toBe(false);
    expect(consume("k", 3, 1000, 1001)).toBe(true);
  });

  it("interroge les fuites par k-anonymat : seuls 5 caractères de l'empreinte partent", async () => {
    let asked = "";
    const fakeFetch = (async (url: string) => {
      asked = url;
      // SHA-1 de « password » : 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
      return new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\n0018A45C4D1DEF81644B54AB7F969B88D65:1");
    }) as typeof fetch;
    expect(await pwnedCount("password", fakeFetch, {})).toBe(9545824);
    expect(asked).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(await pwnedCount("autre chose", fakeFetch, {})).toBe(0);
    expect(await pwnedCount("password", fakeFetch, { HIBP_DISABLED: "true" })).toBeNull();
    expect(await pwnedCount("password", (async () => { throw new Error("hors ligne"); }) as typeof fetch, {})).toBeNull();
  });
});
