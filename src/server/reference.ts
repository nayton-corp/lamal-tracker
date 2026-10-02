import "server-only";
import { getSetting, setSetting } from "@/infrastructure/db/settings";
import { applyCo2, applyDirectory, applySupervisory } from "@/infrastructure/reference/apply";
import { CO2_PAGE_URL, scanCo2Amounts } from "@/infrastructure/reference/co2";
import { fetchBuffer, fetchText } from "@/infrastructure/reference/http";
import { DIRECTORY_PAGE_URL, parseInsurerDirectory, pickDirectoryLink } from "@/infrastructure/reference/insurer-directory";
import { parseSupervisoryData, pickSupervisoryLink, SUPERVISORY_PAGE_URL } from "@/infrastructure/reference/supervisory";
import { readWorkbook } from "@/infrastructure/reference/workbook";
import { db } from "./context";

export interface ReferenceCheck {
  at: string;
  /** Date de l'annuaire des caisses appliqué. */
  directory: string | null;
  results: string[];
  ok: boolean;
}

/**
 * Rafraîchit les référentiels officiels depuis admin.ch : annuaire des caisses (adresses),
 * données de surveillance (indicateurs), redistribution CO2. Chaque source est indépendante :
 * un échec n'empêche pas les autres, et l'app garde les valeurs embarquées.
 */
export async function refreshReference(): Promise<ReferenceCheck> {
  const results: string[] = [];
  let ok = true;
  const local = getSetting<{ directory?: string | null }>(db(), "reference.local") ?? {};

  try {
    const link = pickDirectoryLink(await fetchText(DIRECTORY_PAGE_URL));
    if (!link) throw new Error("lien introuvable");
    const dir = parseInsurerDirectory(await readWorkbook(await fetchBuffer(link.url)));
    const changed = applyDirectory(db(), { validFrom: link.validFrom, entries: dir.entries });
    local.directory = link.validFrom;
    results.push(`Annuaire des caisses${link.validFrom ? ` du ${link.validFrom.split("-").reverse().join(".")}` : ""} : ${changed} mise(s) à jour.`);
  } catch (error) {
    ok = false;
    results.push(`Annuaire des caisses indisponible (${error instanceof Error ? error.message : String(error)}).`);
  }

  try {
    const url = pickSupervisoryLink(await fetchText(SUPERVISORY_PAGE_URL));
    if (!url) throw new Error("lien introuvable");
    const rows = parseSupervisoryData(await readWorkbook(await fetchBuffer(url)));
    applySupervisory(db(), rows);
    results.push(`Indicateurs des caisses : jusqu'à ${Math.max(...rows.map((r) => r.year))}.`);
  } catch (error) {
    ok = false;
    results.push(`Indicateurs des caisses indisponibles (${error instanceof Error ? error.message : String(error)}).`);
  }

  try {
    const amounts = scanCo2Amounts(await fetchText(CO2_PAGE_URL));
    const changed = applyCo2(db(), amounts);
    results.push(`Redistribution CO2 : ${changed} montant(s) mis à jour.`);
  } catch (error) {
    ok = false;
    results.push(`Redistribution CO2 indisponible (${error instanceof Error ? error.message : String(error)}).`);
  }

  setSetting(db(), "reference.local", local);
  const check: ReferenceCheck = { at: new Date().toISOString(), directory: local.directory ?? null, results, ok };
  setSetting(db(), "reference.lastCheck", check);
  return check;
}

/** Rafraîchissement hebdomadaire, en tâche de fond du planificateur. */
export async function referenceTick(): Promise<void> {
  if (process.env.OFSP_AUTO_CHECK === "false") return;
  const last = getSetting<ReferenceCheck>(db(), "reference.lastCheck");
  const ageH = last ? (Date.now() - Date.parse(last.at)) / 3_600_000 : Infinity;
  if (ageH < 24 * 7) return;
  const check = await refreshReference();
  console.log("[reference]", check.results.join(" "));
}
