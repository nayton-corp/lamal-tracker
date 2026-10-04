import { desc, eq, lt } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { auditEvent } from "@/infrastructure/db/schema";

/*
 * Journal de sécurité d'un compte. Il ne contient que le type d'événement, la date et au plus un
 * libellé d'appareil : ni donnée de santé, ni adresse IP, ni mot de passe. Conservé 12 mois.
 */

export const AUDIT_LABELS = {
  SIGNUP: "Compte créé",
  EMAIL_CONFIRMED: "Courriel confirmé",
  LOGIN: "Connexion",
  LOGIN_FAILED: "Mot de passe erroné",
  LOCKED: "Compte verrouillé après plusieurs échecs",
  MFA_FAILED: "Code de double facteur erroné",
  PASSWORD_CHANGED: "Mot de passe modifié",
  PASSWORD_RESET: "Mot de passe réinitialisé par courriel",
  EMAIL_CHANGED: "Courriel modifié",
  TOTP_ENABLED: "Double facteur activé",
  TOTP_DISABLED: "Double facteur désactivé",
  RECOVERY_USED: "Code de secours utilisé",
  RECOVERY_REGENERATED: "Nouveaux codes de secours",
  PASSKEY_ADDED: "Passkey ajoutée",
  PASSKEY_REMOVED: "Passkey retirée",
  SESSIONS_CLOSED: "Autres appareils déconnectés",
  INVITE_CREATED: "Invitation créée",
  MEMBER_JOINED: "Membre arrivé dans le foyer",
  MEMBER_REMOVED: "Membre retiré du foyer",
  MEMBER_LEFT: "Départ du foyer",
  ACCOUNT_DISABLED: "Compte suspendu par l'administrateur",
  ACCOUNT_ENABLED: "Compte réactivé par l'administrateur",
} as const;

export type AuditKind = keyof typeof AUDIT_LABELS;

const RETENTION_DAYS = 365;

export function audit(db: Db, userId: number | null, kind: AuditKind, options: { householdId?: number | null; detail?: string; nowIso?: string } = {}) {
  db.insert(auditEvent)
    .values({
      userId,
      householdId: options.householdId ?? null,
      kind,
      detail: (options.detail ?? "").slice(0, 120),
      ...(options.nowIso ? { createdAt: options.nowIso } : {}),
    })
    .run();
}

export interface AuditEntry {
  kind: AuditKind;
  label: string;
  detail: string;
  createdAt: string;
}

export function recentAudit(db: Db, userId: number, limit = 20): AuditEntry[] {
  return db
    .select({ kind: auditEvent.kind, detail: auditEvent.detail, createdAt: auditEvent.createdAt })
    .from(auditEvent)
    .where(eq(auditEvent.userId, userId))
    .orderBy(desc(auditEvent.createdAt), desc(auditEvent.id))
    .limit(limit)
    .all()
    .map((e) => ({ ...e, kind: e.kind as AuditKind, label: AUDIT_LABELS[e.kind as AuditKind] ?? e.kind }));
}

export function purgeAudit(db: Db, nowIso: string) {
  const limit = new Date(Date.parse(nowIso) - RETENTION_DAYS * 86_400_000).toISOString();
  db.delete(auditEvent).where(lt(auditEvent.createdAt, limit)).run();
}
