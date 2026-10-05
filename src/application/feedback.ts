import { and, count, desc, eq, gte, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/infrastructure/db/client";
import { appUser, feedback } from "@/infrastructure/db/schema";
import type { MailDeps } from "./account-mail";
import { audit } from "./audit";
import { UserError } from "./errors";
import { requireAdmin, type Scope } from "./scope";
import { logMailError } from "@/infrastructure/mail/mailer";

/*
 * Avis envoyés depuis l'app : ils arrivent dans l'administration, et l'administrateur reçoit un
 * courriel qui le prévient sans en reprendre le texte (qui peut parler de santé).
 */

export const FEEDBACK_KINDS = { PROBLEM: "Un problème", IDEA: "Une idée", OTHER: "Autre chose" } as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;
/** Au plus tant d'avis par compte et par jour : de quoi tout dire, pas de quoi inonder. */
export const FEEDBACK_PER_DAY = 5;

const input = z.object({
  kind: z.enum(["PROBLEM", "IDEA", "OTHER"]),
  message: z.string().trim().min(3, "Écrivez quelques mots.").max(2000, "2000 caractères au plus."),
  page: z.string().trim().max(200).regex(/^\/[^\s]*$/).nullable().catch(null),
});

export async function sendFeedback(db: Db, scope: Scope, raw: { kind: unknown; message: unknown; page: unknown }, mail: MailDeps | null, nowIso: string): Promise<void> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Avis incomplet.");
  const dayAgo = new Date(Date.parse(nowIso) - 86_400_000).toISOString();
  const recent = db.select({ n: count() }).from(feedback).where(and(eq(feedback.userId, scope.userId), gte(feedback.createdAt, dayAgo))).get()?.n ?? 0;
  if (recent >= FEEDBACK_PER_DAY) throw new UserError("Merci ! Vous avez déjà envoyé plusieurs avis aujourd'hui : réessayez demain.");
  const { kind, message, page } = parsed.data;
  db.insert(feedback).values({ userId: scope.userId, kind, message, page, createdAt: nowIso }).run();
  if (!mail) return;
  const admins = db.select({ email: appUser.email }).from(appUser).where(and(eq(appUser.role, "ADMIN"), isNull(appUser.disabledAt))).all();
  for (const { email } of admins) {
    if (!email) continue;
    await mail.mailer
      .send({
        to: email,
        subject: `Nouvel avis : ${FEEDBACK_KINDS[kind].toLowerCase()}`,
        text: `Bonjour,\n\nUn avis vient d'arriver dans Primes LAMal. Lisez-le dans l'administration :\n\n${mail.appUrl}/admin#avis\n\n— Primes LAMal`,
      })
      .catch(logMailError("avis"));
  }
}

export interface FeedbackRow {
  id: number;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  email: string | null;
  createdAt: string;
  read: boolean;
}

export function listFeedback(db: Db, scope: Scope, limit = 50): FeedbackRow[] {
  requireAdmin(scope);
  return db
    .select({ id: feedback.id, kind: feedback.kind, message: feedback.message, page: feedback.page, email: appUser.email, createdAt: feedback.createdAt, readAt: feedback.readAt })
    .from(feedback)
    .leftJoin(appUser, eq(appUser.id, feedback.userId))
    .orderBy(desc(feedback.createdAt), desc(feedback.id))
    .limit(limit)
    .all()
    .map(({ readAt, ...r }) => ({ ...r, read: readAt !== null }));
}

/** Lu (ou à relire) ; supprimer efface l'avis. */
export function markFeedback(db: Db, scope: Scope, id: number, action: "read" | "unread" | "delete", nowIso: string) {
  requireAdmin(scope);
  if (action === "delete") {
    if (db.delete(feedback).where(eq(feedback.id, id)).run().changes > 0) audit(db, scope.userId, "FEEDBACK_DELETED", { nowIso });
  } else db.update(feedback).set({ readAt: action === "read" ? nowIso : null }).where(eq(feedback.id, id)).run();
}

/** Avis du compte, pour la copie de ses données. */
export function feedbackOf(db: Db, userId: number) {
  return db.select({ type: feedback.kind, message: feedback.message, page: feedback.page, envoyeLe: feedback.createdAt }).from(feedback).where(eq(feedback.userId, userId)).all();
}
