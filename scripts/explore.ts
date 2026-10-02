/** Exploration temporaire (CI) : fichier des régions de primes BAG et tarifs 2026 vs 2027. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { openDb } from "@/infrastructure/db/client";
import { importPremiumFile } from "@/infrastructure/ofsp/importer";
import { download, guessedArchiveUrl, resolvePremiumsUrl } from "@/infrastructure/ofsp/source";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" };

async function regions() {
  for (const page of ["https://www.bag.admin.ch/de/krankenversicherung-praemienregionen", "https://www.priminfo.admin.ch/de/downloads/aktuell"]) {
    try {
      const html = await (await fetch(page, { headers: UA })).text();
      const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!).filter((h) => /xlsx|xls|csv|region|dam/i.test(h));
      console.log(`\n### ${page}\n${[...new Set(links)].slice(0, 60).join("\n")}`);
    } catch (e) {
      console.log(`### ${page} : ${e}`);
    }
  }
  const html = await (await fetch("https://www.bag.admin.ch/de/krankenversicherung-praemienregionen", { headers: UA })).text().catch(() => "");
  const candidates = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!).filter((h) => /\.xlsx/i.test(h) || /praemienregion|pr%C3%A4mienregion/i.test(h));
  for (const c of candidates.slice(0, 4)) {
    const url = new URL(c, "https://www.bag.admin.ch").toString();
    try {
      const res = await fetch(url, { headers: UA });
      const buf = Buffer.from(await res.arrayBuffer());
      console.log(`\n### ${url} → ${res.status} ${res.headers.get("content-type")} ${buf.length} o`);
      if (buf.subarray(0, 2).toString() !== "PK") continue;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as never);
      for (const ws of wb.worksheets) {
        console.log(`Feuille ${ws.name} (${ws.rowCount} lignes)`);
        for (let r = 1; r <= Math.min(14, ws.rowCount); r++) console.log("  " + JSON.stringify((ws.getRow(r).values as unknown[]).slice(1)).slice(0, 300));
      }
    } catch (e) {
      console.log(`échec ${url} : ${e}`);
    }
  }
}

async function tariffs() {
  const db = openDb(path.join(os.tmpdir(), "explore.db"));
  const dir = path.join(os.tmpdir(), "explore-dl");
  for (const url of [guessedArchiveUrl(2026), await resolvePremiumsUrl()]) {
    const file = await download(url, dir);
    const o = await importPremiumFile(db, file, url);
    console.log(`import ${o.status}`);
  }
  const rows = db.$client
    .prepare(
      `SELECT d.year, i.bag_number bag, i.name, t.code, t.label, t.type_raw, t.model_type,
              (SELECT count(*) FROM premium p WHERE p.tariff_id = t.id) n
       FROM tariff t JOIN tariff_dataset d ON d.id = t.dataset_id JOIN insurer i ON i.id = t.insurer_id
       WHERE d.status = 'ACTIVE' ORDER BY i.bag_number, d.year, t.code`,
    )
    .all() as { year: number; bag: number; name: string; code: string; label: string; type_raw: string; model_type: string; n: number }[];
  fs.writeFileSync("tariffs-2026-2027.json", JSON.stringify(rows));
  let last = -1;
  for (const r of rows) {
    if (r.bag !== last) console.log(`\n== ${r.bag} ${r.name}`);
    last = r.bag;
    console.log(`  ${r.year} | ${r.code} | ${r.label} | ${r.type_raw} → ${r.model_type} | ${r.n}`);
  }
}

await regions();
await tariffs();
