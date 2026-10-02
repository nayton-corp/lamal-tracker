import "server-only";
import { getReviewByYear } from "@/application/review";
import { reviewDeadlines, dueReminder } from "@/domain/deadlines";
import { formatDateLong } from "@/domain/dates";
import { getSetting, setSetting } from "@/infrastructure/db/settings";
import { notifyAll } from "@/infrastructure/push/push";
import { remoteSignature, resolvePremiumsUrl, type RemoteSignature } from "@/infrastructure/ofsp/source";
import { activeDataset } from "@/infrastructure/db/queries";
import { db, ritualYear, today } from "./context";
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
  setSetting(db(), "ofsp.lastCheck", { at: new Date().toISOString(), url, ok: Boolean(sig) });
  const previous = getSetting<RemoteSignature>(db(), "ofsp.signature");
  const changed = !previous || !sig || previous.etag !== sig.etag || previous.lastModified !== sig.lastModified || previous.length !== sig.length || previous.url !== sig.url;
  if (!changed && !force) return "Aucune nouvelle publication.";

  const started = startImport({ kind: "download", url }, async (outcome) => {
    if (sig) setSetting(db(), "ofsp.signature", sig);
    if (outcome.status === "IMPORTED" && outcome.report.year) {
      const year = outcome.report.year;
      await notifyAll(
        db(),
        { title: `Primes ${year} publiées`, body: "Les nouveaux tarifs sont importés : découvrez la hausse pour votre foyer.", url: `/rituel/${year}` },
        `primes-${year}-${outcome.datasetId}`,
      );
    }
  });
  return started ? "Import lancé." : "Un import est déjà en cours.";
}

/** Rappels avant la date d'envoi recommandée, tant que des lettres restent à envoyer. */
export async function sendDeadlineReminders(): Promise<void> {
  const year = ritualYear();
  if (!activeDataset(db(), year)) return;
  const r = getReviewByYear(db(), year);
  if (r?.status === "CLOSED") return;
  const d = reviewDeadlines(year);
  const left = dueReminder(today(), d);
  if (left === null) return;
  await notifyAll(
    db(),
    {
      title: `Primes ${year} : J-${left}`,
      body: `Envoyez vos éventuelles résiliations avant le ${formatDateLong(d.sendBy)} (réception au plus tard le ${formatDateLong(d.receiptDeadline)}).`,
      url: `/rituel/${year}`,
    },
    `rappel-${year}-J${left}`,
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
  if (!activeDataset(db(), year)) return startYearImport(year);
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
}
