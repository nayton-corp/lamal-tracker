import { and, count, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/infrastructure/db/client";
import { appUser, auditEvent, notificationLog } from "@/infrastructure/db/schema";
import type { MailDeps } from "./account-mail";
import { logMailError } from "@/infrastructure/mail/mailer";

/*
 * Alertes d'exploitation envoyées aux administrateurs par courriel : disque presque plein, vague
 * d'échecs de connexion. Au plus une par sujet et par jour, sans aucune donnée personnelle.
 */

/** Alerte sous 10 % d'espace libre, ou sous 1 Go. */
export const DISK_MIN_FREE_RATIO = 0.1;
export const DISK_MIN_FREE_BYTES = 1024 ** 3;
/** Échecs de connexion ou de double facteur sur une heure, tous comptes confondus. */
export const LOGIN_FAILURES_PER_HOUR = 30;

export interface OpsDeps {
  mail: MailDeps | null;
  /** Espace du volume de données ; null s'il ne peut pas être lu. */
  disk: () => { free: number; total: number } | null;
}

const SIGNATURE = "\n\n— Primes LAMal (alerte automatique)";

/** Passe du planificateur : envoie les alertes dues aux administrateurs ; renvoie les clés de celles envoyées. */
export async function opsTick(db: Db, deps: OpsDeps, nowIso: string): Promise<string[]> {
  const alerts: { key: string; subject: string; text: string }[] = [];
  const day = nowIso.slice(0, 10);

  const disk = deps.disk();
  if (disk && disk.total > 0 && (disk.free / disk.total < DISK_MIN_FREE_RATIO || disk.free < DISK_MIN_FREE_BYTES)) {
    const gb = (disk.free / 1024 ** 3).toFixed(1);
    const pct = Math.round((disk.free / disk.total) * 100);
    alerts.push({ key: `ops:disque:${day}`, subject: "Disque presque plein", text: `Il reste ${gb} Go (${pct} %) sur le volume des données. Au-delà, la base et les sauvegardes s'arrêtent : faites de la place ou agrandissez le disque.` });
  }

  const hourAgo = new Date(Date.parse(nowIso) - 3_600_000).toISOString();
  const failures =
    db.select({ n: count() }).from(auditEvent).where(and(inArray(auditEvent.kind, ["LOGIN_FAILED", "MFA_FAILED", "LOCKED"]), gte(auditEvent.createdAt, hourAgo))).get()?.n ?? 0;
  if (failures >= LOGIN_FAILURES_PER_HOUR) {
    alerts.push({ key: `ops:echecs:${day}`, subject: "Vague d'échecs de connexion", text: `${failures} échecs de connexion ou de double facteur dans la dernière heure. Les comptes visés sont verrouillés progressivement ; vérifiez dans l'administration qu'aucun compte n'a changé sans raison.` });
  }

  if (!deps.mail || alerts.length === 0) return [];
  const admins = db.select({ email: appUser.email }).from(appUser).where(and(eq(appUser.role, "ADMIN"), isNotNull(appUser.email), isNull(appUser.disabledAt))).all();
  const sent: string[] = [];
  for (const a of alerts) {
    if (db.select().from(notificationLog).where(eq(notificationLog.key, a.key)).get()) continue;
    for (const { email } of admins) {
      await deps.mail.mailer.send({ to: email!, subject: `Alerte : ${a.subject.toLowerCase()}`, text: `${a.text}${SIGNATURE}` }).catch(logMailError("alerte"));
    }
    db.insert(notificationLog).values({ key: a.key }).onConflictDoNothing().run();
    sent.push(a.key);
  }
  return sent;
}
