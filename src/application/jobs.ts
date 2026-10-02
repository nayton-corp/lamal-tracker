import { addDays, compareIsoDate, formatDateFr } from "@/domain/calendar";
import { isReviewSeason, ordinaryTerminationDeadline, remindersDue, reviewTargetYear } from "@/domain/deadlines";
import { DEFAULT_SEARCH_URL, discoverTariffResources, downloadFile } from "@/infrastructure/ofsp/fetcher";
import type { AppContext } from "./context";
import { importTariffFile } from "./import-tariffs";

export interface NotificationInput {
  key: string;
  title: string;
  body: string;
  url: string | null;
}

/** Envoie une notification push à tous les appareils abonnés ; retourne le nombre d'envois réussis. */
export type PushSender = (n: NotificationInput) => Promise<number>;

/** Enregistre une notification (idempotente par clé) puis la pousse une seule fois. */
export async function notify(ctx: AppContext, push: PushSender, n: NotificationInput): Promise<boolean> {
  const row = ctx.system.addNotification(n);
  if (!row) return false;
  const sent = await push(n).catch(() => 0);
  ctx.system.markPushed(row.id, sent);
  return true;
}

export interface FetchOutcome {
  status: "imported" | "duplicate" | "not-found" | "skipped" | "error";
  message: string;
  datasetId?: number;
}

/** Cherche et importe (en attente de validation) les primes d'une année depuis opendata.swiss. */
export async function fetchTariffsFromOpenData(
  ctx: AppContext,
  year: number,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
  const override = ctx.system.setting<string>("datasetUrlOverride");
  const searchUrl = ctx.system.setting<string>("datasetSearchUrl") || DEFAULT_SEARCH_URL;
  try {
    let url = override?.trim() || null;
    let title = "URL configurée";
    if (!url) {
      const candidates = await discoverTariffResources(year, searchUrl, fetchImpl);
      if (candidates.length === 0) return { status: "not-found", message: `Aucun fichier de primes ${year} trouvé sur opendata.swiss pour l'instant.` };
      url = candidates[0]!.url;
      title = `${candidates[0]!.packageTitle} – ${candidates[0]!.title}`;
    }
    const { bytes, fileName } = await downloadFile(url, fetchImpl);
    const result = importTariffFile(ctx, { fileName, bytes, sourceLabel: `opendata.swiss : ${title}`.slice(0, 200), sourceUrl: url, yearHint: year });
    if (result.duplicateOf !== null) return { status: "duplicate", message: "Ce fichier est déjà importé.", datasetId: result.datasetId };
    return { status: "imported", message: `Primes ${result.report.year} importées : ${result.report.rowsImported} tarifs.`, datasetId: result.datasetId };
  } catch (e) {
    return { status: "error", message: (e as Error).message };
  }
}

export interface DailyJobsResult {
  notifications: string[];
  fetch: FetchOutcome | null;
}

/**
 * Tâche quotidienne : détection des nouvelles primes, rappels d'échéance, suivi des confirmations.
 * Idempotente : chaque notification a une clé unique, relancer la tâche le même jour ne renvoie rien.
 */
export async function runDailyJobs(ctx: AppContext, push: PushSender, fetchImpl: typeof fetch = fetch): Promise<DailyJobsResult> {
  const today = ctx.clock.today();
  const targetYear = reviewTargetYear(today);
  const sent: string[] = [];
  const emit = async (n: NotificationInput) => {
    if (await notify(ctx, push, n)) sent.push(n.key);
  };
  const household = ctx.household.household();
  let fetchOutcome: FetchOutcome | null = null;

  // 1. Nouvelles primes OFSP (saison : mi-septembre → décembre)
  if (isReviewSeason(today)) {
    const hasActive = Boolean(ctx.tariffs.activeDataset(targetYear));
    const staging = ctx.tariffs.listDatasets().find((d) => d.year === targetYear && d.status === "STAGING");
    if (!hasActive && !staging && ctx.system.setting<boolean>("autoFetch") !== false) {
      fetchOutcome = await fetchTariffsFromOpenData(ctx, targetYear, fetchImpl);
      if (fetchOutcome.status === "imported") {
        await emit({
          key: `dataset-imported-${targetYear}`,
          title: `Primes ${targetYear} disponibles`,
          body: "Les primes officielles ont été téléchargées. Vérifie le rapport d'import et active-les pour lancer le rituel.",
          url: `/reglages/primes/${fetchOutcome.datasetId}`,
        });
      }
    }
    if (staging) {
      await emit({
        key: `dataset-staging-${staging.id}`,
        title: `Primes ${targetYear} à valider`,
        body: "Un import attend ta validation avant d'être utilisé.",
        url: `/reglages/primes/${staging.id}`,
      });
    }
    if (hasActive && household && !ctx.reviews.reviewFor(household.id, targetYear)) {
      await emit({
        key: `review-ready-${targetYear}`,
        title: `Rituel ${targetYear} prêt`,
        body: "Les nouvelles primes sont là : découvre la hausse de chaque contrat et les meilleures offres.",
        url: "/",
      });
    }
  }

  // 2. Rappels du rituel en cours
  if (household) {
    const review = ctx.reviews.reviewFor(household.id, targetYear);
    if (review && review.status !== "CLOSED") {
      const deadline = ordinaryTerminationDeadline(review.targetYear);
      const lines = ctx.reviews.lines(review.id);
      const lettersPending = lines.some((l) => l.decision === "SWITCH" && !ctx.reviews.letterForLine(l.id)?.sentAt);
      const undecided = lines.some((l) => l.decision === null);
      if (undecided || lettersPending) {
        for (const offset of remindersDue(today, deadline)) {
          await emit({
            key: `reminder-${review.targetYear}-J${offset}`,
            title: offset === 0 ? "Dernier jour conseillé pour l'envoi" : `J-${offset} avant l'envoi recommandé`,
            body: undecided
              ? `Des décisions restent à prendre. Envoi conseillé le ${formatDateFr(deadline.recommendedSendBy)}.`
              : `Une lettre de résiliation reste à envoyer avant le ${formatDateFr(deadline.recommendedSendBy)}.`,
            url: lettersPending && !undecided ? `/rituel/${review.targetYear}/lettres` : "/",
          });
        }
      }
      for (const letter of ctx.reviews.letters(review.id)) {
        if (letter.sentAt && !letter.insurerAckAt && compareIsoDate(today, addDays(letter.sentAt, 21)) >= 0) {
          await emit({
            key: `ack-missing-${letter.id}`,
            title: "Confirmation de résiliation attendue",
            body: `${ctx.tariffs.insurerName(letter.insurerId)} n'a pas encore confirmé la résiliation envoyée le ${formatDateFr(letter.sentAt)}.`,
            url: `/rituel/${review.targetYear}/lettres`,
          });
        }
      }
      if (compareIsoDate(today, `${review.targetYear - 1}-12-15`) >= 0) {
        for (const line of lines.filter((l) => l.decision === "SWITCH" && !l.affiliationConfirmedAt)) {
          const person = ctx.household.person(line.personId);
          await emit({
            key: `affiliation-${review.targetYear}-${line.id}`,
            title: "Nouvelle police pas encore reçue",
            body: `Vérifie que la nouvelle caisse de ${person?.firstName ?? "la personne"} a confirmé l'affiliation au 1er janvier.`,
            url: `/rituel/${review.targetYear}/lettres`,
          });
        }
      }
    }
    // 3. Clôture en janvier du rituel de l'année en cours
    const currentYear = Number(today.slice(0, 4));
    const current = ctx.reviews.reviewFor(household.id, currentYear);
    if (current && current.status !== "CLOSED" && compareIsoDate(today, `${currentYear}-01-10`) >= 0) {
      await emit({
        key: `close-${currentYear}`,
        title: `Clôture du rituel ${currentYear}`,
        body: "Les nouveaux contrats sont en place : clôture le rituel pour figer l'historique.",
        url: `/rituel/${currentYear}`,
      });
    }
  }
  return { notifications: sent, fetch: fetchOutcome };
}
