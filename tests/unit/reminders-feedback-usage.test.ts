import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { signUp } from "@/application/account";
import type { MailDeps } from "@/application/account-mail";
import { createFirstAdmin } from "@/application/auth";
import { deleteAccountData, exportData } from "@/application/data-rights";
import { FEEDBACK_PER_DAY, listFeedback, markFeedback, sendFeedback } from "@/application/feedback";
import { createSignupInvitation } from "@/application/invitations";
import { paperProgress, reminderTick } from "@/application/reminders";
import { markLetterSent } from "@/application/letters";
import { scopeForUser, type Scope } from "@/application/scope";
import { usageSummary } from "@/application/usage";
import type { Reminder } from "@/domain/reminders";
import { openDb, type Db } from "@/infrastructure/db/client";
import { appUser, feedback, insurer, letter, person, review, tariffDataset } from "@/infrastructure/db/schema";
import { fileMailer } from "@/infrastructure/mail/mailer";
import { testAccount, testHousehold } from "../accounts";

const NOW = "2026-11-16T08:00:00.000Z";
const PW = "une phrase de passe solide";
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

beforeEach(() => {
  db = openDb(":memory:");
  mailDir = fs.mkdtempSync(path.join(os.tmpdir(), "lamal-produit-"));
  mail = { mailer: fileMailer(mailDir), appUrl: "https://primes.exemple.ch" };
});

/** Foyer de deux personnes, dont le propriétaire a un courriel confirmé, et son bilan 2027. */
function household(withReview = true) {
  const owner = testHousehold(db);
  db.update(appUser).set({ email: "foyer@exemple.ch", emailVerifiedAt: NOW }).where(eq(appUser.id, owner.userId)).run();
  for (const firstName of ["Alex", "Sam"]) db.insert(person).values({ householdId: owner.householdId!, firstName, lastName: "Test", birthDate: "1990-04-02" }).run();
  if (!withReview) return { owner, reviewId: null };
  const ds = db.insert(tariffDataset).values({ year: 2027, source: "test", fileSha256: "x", status: "ACTIVE" }).returning().get();
  const reviewId = db.insert(review).values({ householdId: owner.householdId!, targetYear: 2027, datasetId: ds.id, status: "DECIDED" }).returning().get().id;
  return { owner, reviewId };
}

function addLetter(reviewId: number, values: Partial<typeof letter.$inferInsert> = {}) {
  const insurerId = db.select().from(insurer).get()!.id;
  return db.insert(letter).values({ reviewId, insurerId, kind: "TERMINATION", lineIds: [], content: {}, ...values }).returning().get().id;
}

describe("rappels d'envoi et relances", () => {
  it("le foyer qui n'a rien préparé reçoit le rappel par push et par courriel, une seule fois", async () => {
    household(false);
    const pushed: Reminder[] = [];
    const deps = { push: async (_: number, r: Reminder) => void pushed.push(r), mail };
    await reminderTick(db, deps, "2026-11-16", 2027);
    await reminderTick(db, deps, "2026-11-16", 2027);
    // Le push est dédoublonné par sa propre clé (journal des notifications) ; le courriel ici.
    expect(pushed.map((r) => r.key)).toEqual(["rappel-2027-J7", "rappel-2027-J7"]);
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({ to: "foyer@exemple.ch", subject: "Vos courriers d'assurance maladie : plus qu'une semaine" });
    expect(sent()[0]!.text).toContain("https://primes.exemple.ch/bilan/2027");
  });

  it("seuls les courriers non envoyés comptent ; une lettre refusée par Pingen est à reprendre", () => {
    const { owner, reviewId } = household();
    const a = addLetter(reviewId!);
    addLetter(reviewId!, { sentAt: "2026-11-02", pingenStatus: "action_required" });
    expect(paperProgress(db, owner.householdId!, 2027)).toMatchObject({ letters: 2, lettersSent: 0 });
    markLetterSent(db, owner, a, "2026-11-03", "98.00.1");
    const p = paperProgress(db, owner.householdId!, 2027);
    expect(p).toMatchObject({ letters: 2, lettersSent: 1 });
  });

});

describe("avis envoyés depuis l'app", () => {
  async function accounts() {
    const adminId = createFirstAdmin(db, "admin@exemple.ch", PW, NOW);
    const admin = scopeForUser(db, adminId)!;
    const code = createSignupInvitation(db, admin, { maxUses: 5, days: 7 }, NOW);
    const res = await signUp(db, { code, email: "membre@exemple.ch", password: PW, consent: true }, { mail: null, pwned: noLeaks }, NOW);
    if (res.kind !== "signed-in") throw new Error("inscription");
    return { admin, user: scopeForUser(db, res.userId)! };
  }

  it("arrive à l'administrateur, prévenu par un courriel qui n'en reprend pas le texte", async () => {
    const { admin, user } = await accounts();
    await sendFeedback(db, user, { kind: "PROBLEM", message: "Ma franchise de 2500 ne s'affiche pas.", page: "/foyer" }, mail, NOW);
    expect(sent()).toEqual([expect.objectContaining({ to: "admin@exemple.ch", subject: "Nouvel avis : un problème" })]);
    expect(sent()[0]!.text).not.toContain("franchise");
    const [row] = listFeedback(db, admin);
    expect(row).toMatchObject({ kind: "PROBLEM", email: "membre@exemple.ch", page: "/foyer", read: false });
    markFeedback(db, admin, row!.id, "read", NOW);
    expect(listFeedback(db, admin)[0]!.read).toBe(true);
    expect(() => listFeedback(db, user)).toThrow("Réservé à l'administrateur.");
  });

  it("refuse un message vide, une page qui n'est pas un chemin, et plus de cinq avis par jour", async () => {
    const { user } = await accounts();
    await expect(sendFeedback(db, user, { kind: "IDEA", message: " ", page: null }, null, NOW)).rejects.toThrow("Écrivez quelques mots.");
    await sendFeedback(db, user, { kind: "IDEA", message: "Bonne idée", page: "https://ailleurs.example" }, null, NOW);
    expect(db.select().from(feedback).get()!.page).toBeNull();
    for (let i = 1; i < FEEDBACK_PER_DAY; i++) await sendFeedback(db, user, { kind: "OTHER", message: `Avis ${i}`, page: null }, null, NOW);
    await expect(sendFeedback(db, user, { kind: "OTHER", message: "Encore", page: null }, null, NOW)).rejects.toThrow(/réessayez demain/);
    await sendFeedback(db, user, { kind: "OTHER", message: "Le lendemain", page: null }, null, "2026-11-17T09:00:00.000Z");
  });

  it("figure dans la copie des données et disparaît avec le compte", async () => {
    const { user } = await accounts();
    await sendFeedback(db, user, { kind: "IDEA", message: "Un rappel par SMS", page: null }, null, NOW);
    expect(exportData(db, user, NOW).compte.avisEnvoyes).toEqual([expect.objectContaining({ type: "IDEA", message: "Un rappel par SMS" })]);
    deleteAccountData(db, user.userId, NOW);
    expect(db.select().from(feedback).all()).toEqual([]);
  });
});

describe("compteurs internes", () => {
  it("des totaux seulement, qui survivent à la suppression des comptes ; réservés à l'administrateur", async () => {
    const adminId = createFirstAdmin(db, "admin@exemple.ch", PW, NOW);
    const admin: Scope = scopeForUser(db, adminId)!;
    const code = createSignupInvitation(db, admin, { maxUses: 5, days: 7 }, NOW);
    const res = await signUp(db, { code, email: "parti@exemple.ch", password: PW, consent: true }, { mail: null, pwned: noLeaks }, NOW);
    if (res.kind !== "signed-in") throw new Error("inscription");
    const { owner, reviewId } = household();
    const id = addLetter(reviewId!);
    markLetterSent(db, owner, id, "2026-11-03", null);
    markLetterSent(db, owner, id, "2026-11-04", "98.1");
    deleteAccountData(db, res.userId, NOW);
    expect(usageSummary(db, admin)).toEqual({
      accountsCreated: 2,
      accountsActive: 2,
      households: 1,
      lettersSent: 1,
      years: [{ year: 2027, reviews: 1, closed: 0, letters: 1, lettersSent: 1 }],
    });
    expect(() => usageSummary(db, testAccount(db))).toThrow("Réservé à l'administrateur.");
  });
});
