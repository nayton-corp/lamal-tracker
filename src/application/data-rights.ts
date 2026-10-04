import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import type { LetterContent } from "@/domain/letter";
import type { Db } from "@/infrastructure/db/client";
import { insurerLabel } from "@/infrastructure/db/queries";
import {
  appUser,
  auditEvent,
  household,
  householdMember,
  householdSetting,
  insurer,
  lamalPolicy,
  lcaPolicy,
  letter,
  offerRequest,
  passkey,
  person,
  review,
  reviewLine,
  session,
  tariffLineage,
} from "@/infrastructure/db/schema";
import { accountDeletedMail, inactivityMail, type MailDeps } from "./account-mail";
import { AUDIT_LABELS, audit, type AuditKind } from "./audit";
import { requireConfirmed } from "./auth";
import { UserError } from "./errors";
import { feedbackOf } from "./feedback";
import { eraseHousehold } from "./household";
import type { Scope } from "./scope";
import { listSignatures } from "./signatures";

/*
 * Droits des personnes (nLPD) : obtenir une copie de ses données, supprimer son compte et son
 * foyer, et suppression automatique d'un compte inactif depuis 24 mois, après deux rappels.
 */

// ───────────────────────── Export ─────────────────────────

const auditRows = (rows: { kind: string; detail: string; createdAt: string }[]) =>
  rows.map((e) => ({ evenement: AUDIT_LABELS[e.kind as AuditKind] ?? e.kind, detail: e.detail || undefined, date: e.createdAt }));

/**
 * Copie complète des données du compte et de son foyer, déchiffrées. N'en sortent jamais : mots
 * de passe, secrets du double facteur, jetons, clés de chiffrement.
 */
export function exportData(db: Db, scope: Scope, nowIso: string) {
  const user = db.select().from(appUser).where(eq(appUser.id, scope.userId)).get();
  if (!user) throw new UserError("Compte introuvable.");
  const insurerNames = new Map(db.select({ id: insurer.id, name: insurer.name, displayName: insurer.displayName }).from(insurer).all().map((i) => [i.id, insurerLabel(i)]));
  const insurerName = (id: number | null) => (id === null ? null : (insurerNames.get(id) ?? null));

  const compte = {
    courriel: user.email,
    role: user.role === "ADMIN" ? "administrateur" : "utilisateur",
    creeLe: user.createdAt,
    courrielConfirmeLe: user.emailVerifiedAt,
    consentementDonneesSanteLe: user.consentAt,
    derniereActivite: user.lastActiveAt,
    doubleFacteurActifDepuis: user.totpEnabledAt,
    passkeys: db.select({ nom: passkey.name, creeeLe: passkey.createdAt, utiliseeLe: passkey.lastUsedAt }).from(passkey).where(eq(passkey.userId, user.id)).all(),
    appareilsConnectes: db.select({ appareil: session.device, ouvertLe: session.createdAt, vuLe: session.lastSeenAt }).from(session).where(eq(session.userId, user.id)).all(),
    journal: auditRows(db.select().from(auditEvent).where(eq(auditEvent.userId, user.id)).orderBy(desc(auditEvent.createdAt)).all()),
    avisEnvoyes: feedbackOf(db, user.id),
  };

  const householdId = scope.householdId;
  if (householdId === null) return { format: "primes-lamal", version: 1, exporteLe: nowIso, compte, foyer: null };

  const h = db.select().from(household).where(eq(household.id, householdId)).get()!;
  const persons = db.select().from(person).where(eq(person.householdId, householdId)).orderBy(asc(person.sortOrder), asc(person.id)).all();
  const personIds = persons.map((p) => p.id);
  const policies = personIds.length ? db.select().from(lamalPolicy).where(inArray(lamalPolicy.personId, personIds)).orderBy(asc(lamalPolicy.coverageYear)).all() : [];
  const lca = personIds.length ? db.select().from(lcaPolicy).where(inArray(lcaPolicy.personId, personIds)).all() : [];
  const signatures = new Map(listSignatures(db, scope).map((s) => [s.personId, s]));
  const reviews = db.select().from(review).where(eq(review.householdId, householdId)).orderBy(asc(review.targetYear)).all();
  const reviewIds = reviews.map((r) => r.id);
  const lines = reviewIds.length ? db.select().from(reviewLine).where(inArray(reviewLine.reviewId, reviewIds)).all() : [];
  const letters = reviewIds.length ? db.select().from(letter).where(inArray(letter.reviewId, reviewIds)).orderBy(asc(letter.id)).all() : [];
  const offers = reviewIds.length ? db.select().from(offerRequest).where(inArray(offerRequest.reviewId, reviewIds)).orderBy(asc(offerRequest.id)).all() : [];

  const foyer = {
    adresse: { nom: h.name, rue: h.street, npa: h.postalCode, localite: h.city, commune: h.commune, numeroOfs: h.bfsNumber, canton: h.canton, regionPrimes: h.region },
    creeLe: h.createdAt,
    votreRole: scope.householdRole === "OWNER" ? "propriétaire" : "membre",
    membres: db
      .select({ courriel: appUser.email, role: householdMember.role, depuis: householdMember.createdAt })
      .from(householdMember)
      .innerJoin(appUser, eq(appUser.id, householdMember.userId))
      .where(eq(householdMember.householdId, householdId))
      .all()
      .map((m) => ({ ...m, role: m.role === "OWNER" ? "propriétaire" : "membre" })),
    reglages: Object.fromEntries(db.select().from(householdSetting).where(eq(householdSetting.householdId, householdId)).all().map((s) => [s.key, s.value])),
    personnes: persons.map((p) => ({
      id: p.id,
      prenom: p.firstName,
      nom: p.lastName,
      naissance: p.birthDate,
      sousGroupeEnfant: p.kidSubgroup,
      accidentCouvertParEmployeur: p.employedAccidentCover,
      fraisDeSanteAnnuelsRp: p.healthCostsRp,
      modelesAcceptes: p.allowedModels,
      caissesExclues: p.excludedInsurerIds.map((id) => insurerName(id) ?? id),
      medecin: p.doctorName,
      signature: signatures.get(p.id)?.dataUrl ? { image: signatures.get(p.id)!.dataUrl, signeeLe: signatures.get(p.id)!.signedAt } : null,
      contratsLamal: policies
        .filter((c) => c.personId === p.id)
        .map((c) => ({ ...c, caisse: insurerName(c.insurerId) })),
      complementaires: lca
        .filter((c) => c.personId === p.id)
        .map((c) => ({ ...c, caisseLiee: insurerName(c.linkedInsurerId) })),
    })),
    rituels: reviews.map((r) => ({
      annee: r.targetYear,
      statut: r.status,
      strategie: r.strategy,
      ouvertLe: r.createdAt,
      clotureLe: r.closedAt,
      decisions: lines
        .filter((l) => l.reviewId === r.id)
        .map((l) => ({ ...l, caisseChoisie: insurerName(l.chosenInsurerId) })),
      lettres: letters
        .filter((l) => l.reviewId === r.id)
        .map((l) => ({ ...l, caisse: insurerName(l.insurerId), content: l.content as LetterContent })),
      demandesOffre: offers
        .filter((o) => o.reviewId === r.id)
        .map((o) => ({ ...o, caisse: insurerName(o.insurerId), content: o.content as LetterContent })),
    })),
    correspondancesTarifs: db.select().from(tariffLineage).where(eq(tariffLineage.householdId, householdId)).all().map((t) => ({ ...t, caisse: insurerName(t.insurerId) })),
    journal: auditRows(db.select().from(auditEvent).where(eq(auditEvent.householdId, householdId)).orderBy(desc(auditEvent.createdAt)).all()),
  };
  return { format: "primes-lamal", version: 1, exporteLe: nowIso, compte, foyer };
}

export type DataExport = ReturnType<typeof exportData>;

/** Export demandé par l'utilisateur : identité confirmée, et trace au journal. */
export function exportForUser(db: Db, scope: Scope, sessionId: string, nowIso: string): DataExport {
  requireConfirmed(db, sessionId, nowIso);
  const data = exportData(db, scope, nowIso);
  audit(db, scope.userId, "DATA_EXPORTED", { householdId: scope.householdId, nowIso });
  return data;
}

// ───────────────────────── Suppression ─────────────────────────

export interface AccountDeletion {
  /** Le foyer a été supprimé avec le compte (personne d'autre n'y était). */
  householdDeleted: boolean;
  /** Le foyer reste à ses autres membres ; le plus ancien en devient propriétaire au besoin. */
  newOwnerId: number | null;
}

/** Ce que la suppression du compte entraînera, pour l'expliquer avant de confirmer. */
export function deletionPreview(db: Db, scope: Scope): { othersInHousehold: number; lastAdmin: boolean } {
  const others =
    scope.householdId === null
      ? 0
      : db.select({ userId: householdMember.userId }).from(householdMember).where(and(eq(householdMember.householdId, scope.householdId), ne(householdMember.userId, scope.userId))).all().length;
  return { othersInHousehold: others, lastAdmin: scope.admin && isLastAdmin(db, scope.userId) };
}

function isLastAdmin(db: Db, userId: number): boolean {
  const admins = db.select({ id: appUser.id }).from(appUser).where(and(eq(appUser.role, "ADMIN"), isNull(appUser.disabledAt))).all();
  return admins.length === 1 && admins[0]!.id === userId;
}

/**
 * Supprime un compte et tout ce qui lui est propre (sessions, passkeys, codes, journal, appareils
 * abonnés). Seul dans son foyer : le foyer est supprimé aussi, avec sa clé de chiffrement.
 * Sinon le foyer reste aux autres membres.
 */
export function deleteAccountData(db: Db, userId: number, nowIso: string): AccountDeletion {
  const member = db.select().from(householdMember).where(eq(householdMember.userId, userId)).get();
  let result: AccountDeletion = { householdDeleted: false, newOwnerId: null };
  db.transaction((tx) => {
    if (member) {
      const others = tx
        .select()
        .from(householdMember)
        .where(and(eq(householdMember.householdId, member.householdId), ne(householdMember.userId, userId)))
        .orderBy(asc(householdMember.createdAt), asc(householdMember.userId))
        .all();
      if (others.length === 0) {
        eraseHousehold(tx as unknown as Db, member.householdId);
        result = { householdDeleted: true, newOwnerId: null };
      } else if (member.role === "OWNER" && !others.some((o) => o.role === "OWNER")) {
        const heir = others[0]!.userId;
        tx.update(householdMember).set({ role: "OWNER" }).where(eq(householdMember.userId, heir)).run();
        result = { householdDeleted: false, newOwnerId: heir };
      }
    }
    tx.delete(appUser).where(eq(appUser.id, userId)).run();
  });
  if (member && !result.householdDeleted) {
    audit(db, null, "ACCOUNT_DELETED", { householdId: member.householdId, nowIso });
    if (result.newOwnerId !== null) audit(db, result.newOwnerId, "OWNER_TRANSFERRED", { householdId: member.householdId, nowIso });
  }
  return result;
}

/** Suppression demandée par l'utilisateur lui-même, identité confirmée. */
export async function deleteOwnAccount(db: Db, scope: Scope, sessionId: string, mail: MailDeps | null, nowIso: string): Promise<AccountDeletion> {
  requireConfirmed(db, sessionId, nowIso);
  if (scope.admin && isLastAdmin(db, scope.userId)) throw new UserError("Le seul compte administrateur ne peut pas être supprimé : il gère l'instance et ses invitations.");
  const email = db.select({ email: appUser.email }).from(appUser).where(eq(appUser.id, scope.userId)).get()?.email ?? null;
  const result = deleteAccountData(db, scope.userId, nowIso);
  // Un courriel en échec ne doit pas annuler une suppression déjà faite.
  if (mail && email) await mail.mailer.send(accountDeletedMail(email)).catch(() => {});
  return result;
}

// ───────────────────────── Inactivité ─────────────────────────

const DAY = 86_400_000;
/** Délai d'inactivité avant suppression : 24 mois. */
export const INACTIVITY_DAYS = 730;
/** Premier rappel 30 jours avant, second 7 jours avant. */
const NOTICE_DAYS = [30, 7] as const;

const daysBefore = (nowIso: string, days: number) => new Date(Date.parse(nowIso) - days * DAY).toISOString();

/**
 * Passe quotidienne : deux rappels par courriel aux comptes inactifs depuis près de 24 mois, puis
 * suppression. Sans courriel possible (pas d'envoi configuré, pas d'adresse), rien n'est supprimé :
 * personne ne perd ses données sans avoir été prévenu. Les administrateurs ne sont pas concernés.
 */
export async function inactivityTick(db: Db, mail: MailDeps | null, nowIso: string): Promise<{ notified: number; deleted: number }> {
  if (!mail) return { notified: 0, deleted: 0 };
  let notified = 0;
  let deleted = 0;
  const lastActive = (u: { lastActiveAt: string | null; createdAt: string }) => u.lastActiveAt ?? u.createdAt;
  const candidates = db
    .select({ id: appUser.id, email: appUser.email, lastActiveAt: appUser.lastActiveAt, createdAt: appUser.createdAt, notices: appUser.inactivityNotices, noticeAt: appUser.inactivityNoticeAt })
    .from(appUser)
    .where(
      and(
        eq(appUser.role, "USER"),
        isNotNull(appUser.email),
        or(lte(appUser.lastActiveAt, daysBefore(nowIso, INACTIVITY_DAYS - NOTICE_DAYS[0])), and(isNull(appUser.lastActiveAt), lte(appUser.createdAt, daysBefore(nowIso, INACTIVITY_DAYS - NOTICE_DAYS[0])))),
      ),
    )
    .all();
  for (const u of candidates) {
    const since = Date.parse(nowIso) - Date.parse(lastActive(u));
    const deletionAt = new Date(Date.parse(lastActive(u)) + INACTIVITY_DAYS * DAY);
    const noticeAge = u.noticeAt ? Date.parse(nowIso) - Date.parse(u.noticeAt) : Infinity;
    if (u.notices >= NOTICE_DAYS.length && since >= INACTIVITY_DAYS * DAY && noticeAge >= NOTICE_DAYS[1] * DAY) {
      deleteAccountData(db, u.id, nowIso);
      deleted++;
      continue;
    }
    const due = u.notices < NOTICE_DAYS.length && since >= (INACTIVITY_DAYS - NOTICE_DAYS[u.notices]!) * DAY && (u.notices === 0 || noticeAge >= NOTICE_DAYS[1] * DAY - DAY);
    if (!due) continue;
    // Jamais de suppression moins de 7 jours après le dernier rappel.
    const shown = new Date(Math.max(deletionAt.getTime(), Date.parse(nowIso) + NOTICE_DAYS[1] * DAY));
    const date = shown.toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich", day: "numeric", month: "long", year: "numeric" });
    try {
      await mail.mailer.send(inactivityMail(u.email!, date, `${mail.appUrl}/login`));
    } catch {
      continue;
    }
    db.update(appUser).set({ inactivityNotices: u.notices + 1, inactivityNoticeAt: nowIso }).where(eq(appUser.id, u.id)).run();
    audit(db, u.id, "INACTIVITY_NOTICE", { nowIso });
    notified++;
  }
  return { notified, deleted };
}
