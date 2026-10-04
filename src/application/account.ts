import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { appUser, authToken, householdMember, passkey } from "@/infrastructure/db/schema";
import { bumpUsage } from "./usage";
import { alreadyRegisteredMail, emailChangeMail, passwordResetDoneMail, resetPasswordMail, verifyEmailMail, type MailDeps } from "./account-mail";
import { audit } from "./audit";
import { checkNewPassword, closeAllSessions, findUserByEmail, normalizeEmail, setPassword, storedPassword, validatePassword, verifyPassword, type PwnedCheck } from "./auth";
import { UserError } from "./errors";
import { claimInvitation, findUsableInvitation } from "./invitations";
import { checkSecondFactor, FACTOR_LOCKED, recoveryCodesLeft } from "./mfa";
import { consumeToken, countAttempt, deleteUserTokens, issueToken, peekToken } from "./tokens";

/*
 * Cycle de vie d'un compte : inscription sur invitation, confirmation du courriel, réinitialisation
 * du mot de passe, changement de courriel. Sans envoi de courriels configuré (`mail` null),
 * l'inscription ouvre la session tout de suite et la réinitialisation par courriel est indisponible.
 */

const VERIFY_HOURS = 24;
const RESET_MINUTES = 60;
/** Codes de double facteur erronés tolérés sur un même lien de réinitialisation. */
const MAX_RESET_CODE_ATTEMPTS = 5;
/** Délai minimal entre deux liens de confirmation renvoyés au même compte. */
const RESEND_MINUTES = 5;

export interface AccountDeps {
  mail: MailDeps | null;
  pwned: PwnedCheck;
}

const link = (mail: MailDeps, path: string, token: string) => `${mail.appUrl}${path}?t=${encodeURIComponent(token)}`;

export type SignUpResult = { kind: "check-mail" } | { kind: "signed-in"; userId: number };

/**
 * Inscription avec un code d'invitation. Une adresse déjà inscrite n'est pas révélée : la personne
 * voit le même écran, et le titulaire de l'adresse reçoit un courriel qui le lui signale.
 */
export async function signUp(
  db: Db,
  input: { code: string; email: string; password: string; consent: boolean },
  deps: AccountDeps,
  nowIso: string,
): Promise<SignUpResult> {
  const email = normalizeEmail(input.email);
  if (!input.consent) throw new UserError("Votre accord est nécessaire pour enregistrer des données de santé.");
  const invite = findUsableInvitation(db, input.code, nowIso);
  if (!invite) throw new UserError("Ce code d'invitation n'est pas valable (expiré, déjà utilisé ou erroné).");
  await checkNewPassword(input.password, deps.pwned);

  if (findUserByEmail(db, email)) {
    if (!deps.mail) throw new UserError("Cette adresse a déjà un compte : connectez-vous.");
    await deps.mail.mailer.send(alreadyRegisteredMail(email, `${deps.mail.appUrl}/login`, `${deps.mail.appUrl}/login/oubli`));
    return { kind: "check-mail" };
  }

  const password = storedPassword(input.password);
  const userId = db.transaction((tx) => {
    claimInvitation(tx, invite, nowIso);
    const created = tx.insert(appUser).values({ email, password, role: "USER", consentAt: nowIso, createdAt: nowIso }).returning().get().id;
    if (invite.kind === "HOUSEHOLD") tx.insert(householdMember).values({ householdId: invite.householdId!, userId: created, role: "MEMBER", createdAt: nowIso }).run();
    bumpUsage(tx, "accounts.created");
    return created;
  });
  audit(db, userId, "SIGNUP", { nowIso });
  if (invite.kind === "HOUSEHOLD") audit(db, invite.createdBy, "MEMBER_JOINED", { householdId: invite.householdId, nowIso });

  if (!deps.mail) return { kind: "signed-in", userId };
  await sendVerification(db, userId, email, deps.mail, nowIso);
  return { kind: "check-mail" };
}

async function sendVerification(db: Db, userId: number, email: string, mail: MailDeps, nowIso: string) {
  deleteUserTokens(db, userId, "VERIFY_EMAIL");
  const token = issueToken(db, { userId, kind: "VERIFY_EMAIL", ttlMs: VERIFY_HOURS * 3_600_000, data: { email } }, nowIso);
  await mail.mailer.send(verifyEmailMail(email, link(mail, "/verifier", token)));
}

/** Connexion d'un compte non confirmé : un nouveau lien part, au plus toutes les 5 minutes. */
export async function resendVerification(db: Db, userId: number, mail: MailDeps, nowIso: string) {
  const user = db.select().from(appUser).where(eq(appUser.id, userId)).get();
  if (!user?.email || user.emailVerifiedAt) return;
  const last = db
    .select({ createdAt: authToken.createdAt })
    .from(authToken)
    .where(and(eq(authToken.userId, userId), eq(authToken.kind, "VERIFY_EMAIL")))
    .orderBy(desc(authToken.createdAt))
    .get();
  if (last && Date.parse(nowIso) - Date.parse(last.createdAt) < RESEND_MINUTES * 60_000) return;
  await sendVerification(db, userId, user.email, mail, nowIso);
}

/** Lien de confirmation encore valable (la page demande un clic avant de le consommer). */
export function verificationPending(db: Db, token: string | undefined, nowIso: string): boolean {
  return peekToken(db, "VERIFY_EMAIL", token, nowIso) !== null;
}

/**
 * Confirme l'adresse du lien : celle de l'inscription, ou la nouvelle adresse d'un changement.
 * Renvoie le compte, pour ouvrir sa session.
 */
export function confirmEmail(db: Db, token: string | undefined, nowIso: string): number {
  const row = consumeToken(db, "VERIFY_EMAIL", token, nowIso);
  if (!row?.userId) throw new UserError("Ce lien n'est plus valable. Connectez-vous pour en recevoir un nouveau.");
  const email = String(row.data?.email ?? "");
  const user = db.select().from(appUser).where(eq(appUser.id, row.userId)).get();
  if (!user || user.disabledAt) throw new UserError("Ce lien n'est plus valable.");
  const taken = findUserByEmail(db, email);
  if (taken && taken.id !== user.id) throw new UserError("Cette adresse est déjà utilisée par un autre compte.");
  const changed = user.email !== email;
  db.update(appUser).set({ email, emailVerifiedAt: nowIso }).where(eq(appUser.id, user.id)).run();
  audit(db, user.id, changed ? "EMAIL_CHANGED" : "EMAIL_CONFIRMED", { nowIso });
  return user.id;
}

/** Demande de réinitialisation : même réponse, que l'adresse ait un compte ou non. */
export async function requestPasswordReset(db: Db, rawEmail: string, mail: MailDeps, nowIso: string) {
  let email: string;
  try {
    email = normalizeEmail(rawEmail);
  } catch {
    return;
  }
  const user = findUserByEmail(db, email);
  if (!user || user.disabledAt || !user.emailVerifiedAt) return;
  deleteUserTokens(db, user.id, "RESET_PASSWORD");
  const token = issueToken(db, { userId: user.id, kind: "RESET_PASSWORD", ttlMs: RESET_MINUTES * 60_000 }, nowIso);
  await mail.mailer.send(resetPasswordMail(email, link(mail, "/login/reinitialiser", token)));
}

/** Lien de réinitialisation valable ? Et faut-il le code du double facteur ? */
export function resetInfo(db: Db, token: string | undefined, nowIso: string): { needsCode: boolean } | null {
  const row = peekToken(db, "RESET_PASSWORD", token, nowIso);
  if (!row?.userId) return null;
  const user = db.select({ totp: appUser.totpEnabledAt }).from(appUser).where(eq(appUser.id, row.userId)).get();
  return user ? { needsCode: Boolean(user.totp) } : null;
}

/**
 * Nouveau mot de passe par lien. Le double facteur reste exigé s'il est actif (code ou code de
 * secours). Toutes les sessions sont fermées, et un courriel prévient le titulaire.
 */
export async function resetPassword(
  db: Db,
  input: { token: string; password: string; code?: string },
  deps: AccountDeps,
  now: { iso: string; ms: number },
): Promise<void> {
  const invalid = "Ce lien n'est plus valable : faites une nouvelle demande.";
  const row = peekToken(db, "RESET_PASSWORD", input.token, now.iso);
  if (!row?.userId) throw new UserError(invalid);
  const user = db.select().from(appUser).where(eq(appUser.id, row.userId)).get();
  if (!user || user.disabledAt) throw new UserError(invalid);
  validatePassword(input.password);
  // Le code d'abord : un lien volé n'offre que quelques essais, puis il disparaît.
  if (user.totpEnabledAt) {
    const result = checkSecondFactor(db, user.id, input.code ?? "", now.ms, now.iso);
    if (result === "locked") throw new UserError(FACTOR_LOCKED);
    if (result === "wrong") {
      if (!countAttempt(db, row.id, MAX_RESET_CODE_ATTEMPTS)) throw new UserError(invalid);
      throw new UserError("Code du double facteur incorrect.");
    }
  }
  await checkNewPassword(input.password, deps.pwned);
  if (!consumeToken(db, "RESET_PASSWORD", input.token, now.iso)) throw new UserError(invalid);
  setPassword(db, user.id, input.password);
  closeAllSessions(db, user.id);
  audit(db, user.id, "PASSWORD_RESET", { nowIso: now.iso });
  if (deps.mail && user.email) await deps.mail.mailer.send(passwordResetDoneMail(user.email));
}

/**
 * Changement de courriel : un lien part vers la nouvelle adresse, qui ne remplace l'ancienne
 * qu'une fois confirmée. Sans envoi de courriels, seul l'administrateur peut l'enregistrer
 * directement (instance personnelle).
 */
export async function requestEmailChange(
  db: Db,
  userId: number,
  input: { email: string; password: string },
  mail: MailDeps | null,
  nowIso: string,
): Promise<"sent" | "changed"> {
  const email = normalizeEmail(input.email);
  const user = db.select().from(appUser).where(eq(appUser.id, userId)).get();
  if (!user) throw new UserError("Compte introuvable.");
  if (!verifyPassword(db, userId, input.password)) throw new UserError("Mot de passe incorrect.");
  if (user.email === email) throw new UserError("C'est déjà votre adresse.");
  if (findUserByEmail(db, email)) throw new UserError("Cette adresse est déjà utilisée par un autre compte.");
  if (mail) {
    deleteUserTokens(db, userId, "VERIFY_EMAIL");
    const token = issueToken(db, { userId, kind: "VERIFY_EMAIL", ttlMs: VERIFY_HOURS * 3_600_000, data: { email } }, nowIso);
    await mail.mailer.send(emailChangeMail(email, link(mail, "/verifier", token)));
    return "sent";
  }
  if (user.role !== "ADMIN") throw new UserError("L'envoi de courriels n'est pas configuré : demandez à l'administrateur.");
  db.update(appUser).set({ email, emailVerifiedAt: nowIso }).where(eq(appUser.id, userId)).run();
  audit(db, userId, "EMAIL_CHANGED", { nowIso });
  return "changed";
}

/** Ce que la page « Mon compte » affiche. */
export function accountOverview(db: Db, userId: number) {
  const user = db.select().from(appUser).where(eq(appUser.id, userId)).get();
  if (!user) throw new UserError("Compte introuvable.");
  const keys = db
    .select({ id: passkey.id, name: passkey.name, createdAt: passkey.createdAt, lastUsedAt: passkey.lastUsedAt })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .orderBy(passkey.createdAt)
    .all();
  return {
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    admin: user.role === "ADMIN",
    totp: Boolean(user.totpEnabledAt),
    recoveryLeft: user.totpEnabledAt ? recoveryCodesLeft(db, userId) : 0,
    passkeys: keys,
    createdAt: user.createdAt,
  };
}
