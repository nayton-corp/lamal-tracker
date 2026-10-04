import "server-only";
import fs from "node:fs";
import path from "node:path";
import { opsTick } from "@/application/ops";
import { reminderTick } from "@/application/reminders";
import { getSetting, setSetting } from "@/infrastructure/db/settings";
import { householdKey, notify } from "@/infrastructure/push/push";
import { remoteSignature, resolvePremiumsUrl, type RemoteSignature } from "@/infrastructure/ofsp/source";
import { yearAttemptKey, yearRetryDue } from "@/infrastructure/ofsp/retry";
import { activeDataset } from "@/infrastructure/db/queries";
import { purgeAudit } from "@/application/audit";
import { purgeExpiredTokens } from "@/application/tokens";
import { inactivityTick } from "@/application/data-rights";
import { mailDeps } from "./accounts";
import { db, nowIso, ritualYear, today } from "./context";
import { pingenTick } from "./pingen";
import { referenceTick } from "./reference";
import { importJob, startBootstrapImport, startImport, startYearImport } from "./jobs";
import { latestActiveYear } from "@/infrastructure/db/queries";

/**
 * Vérifie si l'OFSP a publié un nouveau fichier (signature HTTP), et l'importe si oui.
 * Appelé par le planificateur ; peut aussi être forcé depuis l'interface.
 */
export async function checkForNewPremiums(force = false): Promise<string> {
  const url = await resolvePremiumsUrl();
  let sig: RemoteSignature | null = null;
  try {
    sig = await remoteSignature(url);
  } catch (error) {
    if (!force) throw error;
  }
  const previous = getSetting<RemoteSignature>(db(), "ofsp.signature");
  const changed = !previous || !sig || previous.etag !== sig.etag || previous.lastModified !== sig.lastModified || previous.length !== sig.length || previous.url !== sig.url;
  if (!changed && !force) {
    setSetting(db(), "ofsp.lastCheck", { at: new Date().toISOString(), url, ok: true });
    return "Aucune nouvelle publication.";
  }

  const started = startImport({ kind: "download", url }, async (outcome) => {
    // Signature mémorisée seulement si le fichier a été pris en compte : un import refusé
    // (FAILED) sera retenté au prochain contrôle sans attendre une nouvelle publication.
    if (sig && (outcome.status === "IMPORTED" || outcome.status === "ALREADY")) setSetting(db(), "ofsp.signature", sig);
    if (outcome.status === "IMPORTED" && outcome.report.year) {
      const year = outcome.report.year;
      await notify(
        db(),
        { all: true },
        { title: `Primes ${year} publiées`, body: "Les nouveaux tarifs sont importés : découvrez la hausse pour votre foyer.", url: `/rituel/${year}` },
        `primes-${year}-${outcome.datasetId}`,
      );
    }
  });
  // Le contrôle ne compte que si l'import a pu démarrer ; sinon on réessaie à la prochaine passe.
  if (started) setSetting(db(), "ofsp.lastCheck", { at: new Date().toISOString(), url, ok: Boolean(sig) });
  return started ? "Import lancé." : "Un import est déjà en cours.";
}

/**
 * Rappels d'envoi des courriers (seulement aux foyers qui ont encore quelque chose à poster) et
 * relances quand une caisse tarde à confirmer.
 */
export async function sendDeadlineReminders(): Promise<void> {
  const year = ritualYear();
  if (!activeDataset(db(), year)) return;
  await reminderTick(
    db(),
    {
      push: (householdId, r) => notify(db(), { householdId }, { title: r.title, body: r.body, url: r.url }, householdKey(householdId, r.key)),
      mail: mailDeps(),
    },
    today(),
    year,
  );
}

function inPublicationSeason(iso: string): boolean {
  const md = iso.slice(5);
  return md >= "09-15" && md <= "11-30";
}

/**
 * Primes indispensables : les plus récentes publiées et celles de l'année en cours (pour
 * pré-remplir les contrats actuels). Importées sans intervention au premier démarrage.
 */
function ensureBaseDatasets(): boolean {
  if (process.env.OFSP_AUTO_CHECK === "false" || importJob().running) return false;
  const year = Number(today().slice(0, 4));
  if (latestActiveYear(db()) === null) {
    return startBootstrapImport(year, async (outcome) => {
      if (outcome.status === "IMPORTED") setSetting(db(), "ofsp.lastCheck", { at: new Date().toISOString(), ok: true });
    });
  }
  if (!activeDataset(db(), year)) {
    // Archive de l'année pas encore publiée : au plus une tentative par jour, pas une par heure.
    const key = yearAttemptKey(year);
    if (!yearRetryDue(getSetting<{ at: string }>(db(), key), Date.now())) return false;
    setSetting(db(), key, { at: new Date().toISOString() });
    return startYearImport(year);
  }
  return false;
}

/** Une passe du planificateur : en saison, contrôle quotidien ; sinon hebdomadaire. */
export async function schedulerTick(): Promise<void> {
  if (ensureBaseDatasets()) {
    console.log("[watch] import initial des primes lancé");
    return;
  }
  const last = getSetting<{ at: string }>(db(), "ofsp.lastCheck");
  const ageH = last ? (Date.now() - Date.parse(last.at)) / 3_600_000 : Infinity;
  const every = inPublicationSeason(today()) ? 20 : 24 * 7;
  if (process.env.OFSP_AUTO_CHECK !== "false" && ageH >= every) {
    try {
      console.log("[watch]", await checkForNewPremiums());
    } catch (error) {
      console.error("[watch] contrôle OFSP impossible :", error instanceof Error ? error.message : error);
      setSetting(db(), "ofsp.lastCheck", { at: new Date().toISOString(), ok: false });
    }
  }
  try {
    await referenceTick();
  } catch (error) {
    console.error("[watch] référentiels", error);
  }
  try {
    await sendDeadlineReminders();
  } catch (error) {
    console.error("[watch] rappels", error);
  }
  try {
    await pingenTick();
  } catch (error) {
    console.error("[watch] suivi Pingen", error);
  }
  try {
    const { notified, deleted } = await inactivityTick(db(), mailDeps(), nowIso());
    if (notified || deleted) console.log(`[watch] comptes inactifs : ${notified} rappel(s), ${deleted} suppression(s)`);
  } catch (error) {
    console.error("[watch] comptes inactifs", error instanceof Error ? error.message : error);
  }
  try {
    const sent = await opsTick(db(), { mail: mailDeps(), disk: dataDisk }, nowIso());
    if (sent.length) console.warn(`[watch] alertes d'exploitation envoyées : ${sent.join(", ")}`);
  } catch (error) {
    console.error("[watch] alertes", error instanceof Error ? error.message : error);
  }
  // Ménage : jetons expirés, journal de sécurité de plus de 12 mois.
  purgeExpiredTokens(db(), nowIso());
  purgeAudit(db(), nowIso());
}

/** Espace libre du volume qui contient la base. */
function dataDisk(): { free: number; total: number } | null {
  try {
    const dir = path.dirname(db().$client.name);
    const st = fs.statfsSync(dir);
    return { free: st.bavail * st.bsize, total: st.blocks * st.bsize };
  } catch {
    return null;
  }
}

/**
 * Signal de vie du planificateur (HEALTHCHECK_PING_URL, service de type healthchecks.io) : s'il
 * cesse, l'app ou ses tâches de fond sont arrêtées et le service prévient l'exploitant.
 */
export async function pingHeartbeat(ok: boolean): Promise<void> {
  const url = process.env.HEALTHCHECK_PING_URL?.trim();
  if (!url) return;
  try {
    await fetch(ok ? url : `${url.replace(/\/$/, "")}/fail`, { method: "POST", signal: AbortSignal.timeout(10_000) });
  } catch {
    // Le service de surveillance est injoignable : il le signalera lui-même par l'absence de ping.
    console.warn("[watch] signal de vie non transmis");
  }
}
