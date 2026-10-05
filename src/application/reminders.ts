import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { reviewDeadlines } from "@/domain/deadlines";
import { pingenFailed } from "@/domain/pingen";
import { letterReminders, type LetterProgress, type Reminder } from "@/domain/reminders";
import type { Db } from "@/infrastructure/db/client";
import { insurerLabel } from "@/domain/insurer";
import { appUser, household, householdMember, insurer, letter, notificationLog, offerRequest, person, review, reviewLine } from "@/infrastructure/db/schema";
import type { MailDeps } from "./account-mail";
import { logMailError } from "@/infrastructure/mail/mailer";

const SIGNATURE = "\n\n— Primes LAMal\nCe message est automatique : n'y répondez pas.";

/** Avancement des courriers d'un foyer pour l'année cible (sans rituel ouvert : rien de préparé). */
export function paperProgress(db: Db, householdId: number, targetYear: number): LetterProgress {
  const persons = db.select({ id: person.id }).from(person).where(eq(person.householdId, householdId)).all().length;
  const r = db.select().from(review).where(and(eq(review.householdId, householdId), eq(review.targetYear, targetYear))).get();
  if (!r) return { closed: false, persons, keeping: 0, letters: 0, lettersSent: 0, awaiting: [] };
  const lines = db.select({ decision: reviewLine.decision }).from(reviewLine).where(eq(reviewLine.reviewId, r.id)).all();
  const letters = db.select().from(letter).where(eq(letter.reviewId, r.id)).all();
  const offers = db.select().from(offerRequest).where(eq(offerRequest.reviewId, r.id)).all();
  const insurerIds = [...new Set([...letters, ...offers].map((x) => x.insurerId))];
  const names = new Map(
    (insurerIds.length ? db.select().from(insurer).where(inArray(insurer.id, insurerIds)).all() : []).map((i) => [i.id, insurerLabel(i)]),
  );
  // Une lettre refusée par Pingen est à reprendre : elle compte comme non envoyée.
  const sent = (l: typeof letter.$inferSelect) => Boolean(l.sentAt) && !pingenFailed(l.pingenStatus);
  return {
    closed: r.status === "CLOSED",
    persons: lines.length || persons,
    keeping: lines.filter((l) => l.decision === "KEEP").length,
    letters: letters.length,
    lettersSent: letters.filter(sent).length,
    awaiting: [
      ...offers
        .filter((o) => o.sentAt && !o.answeredAt)
        .map((o) => ({ key: `offre-${o.id}`, insurer: names.get(o.insurerId) ?? "la caisse", what: "affiliation" as const, sentAt: o.sentAt!.slice(0, 10) })),
      ...letters
        .filter((l) => l.kind === "TERMINATION" && sent(l) && !l.acknowledgedAt)
        .map((l) => ({ key: `lettre-${l.id}`, insurer: names.get(l.insurerId) ?? "la caisse", what: "fin du contrat" as const, sentAt: l.sentAt!.slice(0, 10) })),
    ],
  };
}

export interface ReminderDeps {
  /** Notification push aux appareils du foyer, dédoublonnée par clé. */
  push: (householdId: number, reminder: Reminder) => Promise<unknown>;
  mail: MailDeps | null;
}

const householdLogKey = (householdId: number, key: string) => `h${householdId}:${key}`;

/**
 * Passe quotidienne : rappels d'envoi et relances de confirmation, foyer par foyer. Le push part
 * vers les appareils abonnés ; les rappels importants partent aussi par courriel aux membres dont
 * l'adresse est confirmée, une seule fois par foyer et par rappel.
 */
export async function reminderTick(db: Db, deps: ReminderDeps, today: string, targetYear: number): Promise<void> {
  const deadlines = reviewDeadlines(targetYear);
  for (const householdRow of db.select({ id: household.id }).from(household).all()) {
    const reminders = letterReminders(today, targetYear, deadlines, paperProgress(db, householdRow.id, targetYear));
    for (const r of reminders) {
      await deps.push(householdRow.id, r);
      if (!r.mail || !deps.mail) continue;
      const logKey = householdLogKey(householdRow.id, `courriel:${r.key}`);
      if (db.select().from(notificationLog).where(eq(notificationLog.key, logKey)).get()) continue;
      const recipients = db
        .select({ email: appUser.email })
        .from(householdMember)
        .innerJoin(appUser, eq(appUser.id, householdMember.userId))
        .where(and(eq(householdMember.householdId, householdRow.id), isNotNull(appUser.email), isNotNull(appUser.emailVerifiedAt), isNull(appUser.disabledAt)))
        .all();
      for (const { email } of recipients) {
        const text = `${r.mail.text}\n\nOuvrir l'app : ${deps.mail.appUrl}${r.url}${SIGNATURE}`;
        // Un courriel en échec n'empêche pas les autres ; il n'est pas retenté.
        await deps.mail.mailer.send({ to: email!, subject: r.mail.subject, text }).catch(logMailError("rappel"));
      }
      db.insert(notificationLog).values({ key: logKey }).onConflictDoNothing().run();
    }
  }
}
