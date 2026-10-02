/**
 * Régénère les référentiels officiels embarqués dans l'app (src/infrastructure/reference/data) :
 *  - annuaire des caisses-maladie reconnues (OFSP) : raison sociale, adresse, contacts ;
 *  - données de surveillance (OFSP) : assurés, frais administratifs, réserves par caisse ;
 *  - redistribution CO2 (OFEV) : nouveaux montants annoncés.
 *
 * Exécuté en CI (admin.ch n'est pas joignable partout) ; l'app embarque le résultat et le
 * Raspberry Pi le rafraîchit lui-même ensuite (server/reference.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { CO2_PAGE_URL, scanCo2Amounts } from "@/infrastructure/reference/co2";
import { DIRECTORY_PAGE_URL, parseInsurerDirectory, pickDirectoryLink } from "@/infrastructure/reference/insurer-directory";
import { parseSupervisoryData, pickSupervisoryLink, SUPERVISORY_PAGE_URL } from "@/infrastructure/reference/supervisory";
import { readWorkbook } from "@/infrastructure/reference/workbook";
import { fetchBuffer, fetchText } from "@/infrastructure/reference/http";

const OUT = path.join(process.cwd(), "src", "infrastructure", "reference", "data");

function write(name: string, data: unknown) {
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(data, null, 1)}\n`);
  console.log(`écrit ${name}`);
}

async function insurers() {
  const link = pickDirectoryLink(await fetchText(DIRECTORY_PAGE_URL));
  if (!link) throw new Error("Lien de l'annuaire des assureurs introuvable.");
  console.log(`Annuaire : ${link.url}`);
  const dir = parseInsurerDirectory(await readWorkbook(await fetchBuffer(link.url)));
  console.log(`${dir.entries.length} caisses`);
  write("insurers.json", { source: link.url, validFrom: link.validFrom, entries: dir.entries });
}

async function supervisory() {
  const url = pickSupervisoryLink(await fetchText(SUPERVISORY_PAGE_URL));
  if (!url) throw new Error("Lien des données de surveillance introuvable.");
  console.log(`Surveillance : ${url}`);
  const rows = parseSupervisoryData(await readWorkbook(await fetchBuffer(url)));
  console.log(`${rows.length} lignes, ${new Set(rows.map((r) => r.year)).size} années`);
  write("supervisory.json", { source: url, rows: rows.map((r) => [r.bagNumber, r.year, r.insured, r.premiumPerInsuredRp, r.benefitsPerInsuredRp, r.adminPerInsuredRp, r.reservesPerInsuredRp]) });
}

async function co2() {
  const file = path.join(OUT, "co2.json");
  const current = JSON.parse(fs.readFileSync(file, "utf8")) as { source: string; amountsRp: Record<string, number> };
  const found = scanCo2Amounts(await fetchText(CO2_PAGE_URL));
  let added = 0;
  for (const [year, rp] of found) {
    if (current.amountsRp[year] === undefined) {
      current.amountsRp[year] = rp;
      added++;
    }
  }
  console.log(`CO2 : ${found.size} montant(s) lu(s), ${added} nouveau(x)`);
  if (added) write("co2.json", current);
}

const failures: string[] = [];
for (const [name, job] of [["annuaire", insurers], ["surveillance", supervisory], ["CO2", co2]] as const) {
  try {
    await job();
  } catch (error) {
    failures.push(`${name} : ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
