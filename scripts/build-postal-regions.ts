/**
 * Génère src/infrastructure/regions/postal-regions.json : code postal → commune → région de primes.
 *
 * Sources officielles (téléchargées en CI, admin.ch n'étant pas toujours joignable ailleurs) :
 *  - BAG, annexe de l'ordonnance sur les régions de primes : commune (n° OFS) → région ;
 *  - swisstopo, répertoire officiel des localités : code postal → commune (n° OFS), part des adresses.
 */
import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" };
const OUT = path.join(process.cwd(), "src", "infrastructure", "regions", "postal-regions.json");

async function get(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v && "richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  if (typeof v === "object" && v && "result" in v) return String((v as { result: unknown }).result);
  return String(v).trim();
}

async function regionWorkbook(): Promise<{ buf: Buffer; validFrom: string }> {
  const page = await (await fetch("https://www.bag.admin.ch/de/krankenversicherung-praemienregionen", { headers: UA })).text();
  const links = [...page.matchAll(/href="([^"]+\.xlsx)"/g)].map((m) => new URL(m[1]!, "https://www.bag.admin.ch").toString());
  const main = links.find((l) => /pr%C3%A4mienregionen|praemienregionen/i.test(l)) ?? links[0];
  if (!main) throw new Error("Lien du fichier des régions introuvable sur bag.admin.ch");
  console.log(`Régions : ${main}`);
  const validFrom = /g%C3%BCltig%20ab%20([\d.]+)/i.exec(main)?.[1] ?? "";
  return { buf: await get(main), validFrom: validFrom.replace(/\.$/, "") };
}

interface CommuneRegion {
  canton: string;
  commune: string;
  region: number;
}

async function communeRegions(): Promise<{ byBfs: Map<number, CommuneRegion>; validFrom: string }> {
  const { buf, validFrom } = await regionWorkbook();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const byBfs = new Map<number, CommuneRegion>();
  const main = wb.worksheets[0]!;
  let started = false;
  main.eachRow((row) => {
    const v = (row.values as unknown[]).slice(1).map(cellText);
    if (!started) {
      started = v.some((c) => /BFS/i.test(c));
      return;
    }
    const [canton, bfs, commune, region] = v;
    const n = Number(bfs);
    const r = Number(/(\d)\s*$/.exec(region ?? "")?.[1]);
    if (canton && Number.isInteger(n) && n > 0 && Number.isInteger(r)) byBfs.set(n, { canton, commune: commune ?? "", region: r });
  });
  // Fusions : l'ancien n° OFS renvoie à la nouvelle commune.
  const mut = wb.worksheets[1];
  mut?.eachRow((row) => {
    const v = (row.values as unknown[]).slice(1).map(cellText);
    const m = /fus\s+(\d+)/i.exec(v[3] ?? "");
    const oldBfs = Number(v[0]);
    if (m && Number.isInteger(oldBfs) && !byBfs.has(oldBfs) && byBfs.has(Number(m[1]))) byBfs.set(oldBfs, byBfs.get(Number(m[1]))!);
  });
  console.log(`${byBfs.size} communes avec région`);
  return { byBfs, validFrom };
}

function splitCsv(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

async function localities(): Promise<{ plz: string; locality: string; bfs: number; commune: string; canton: string; share: number }[]> {
  const url = "https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_2056.csv.zip";
  const zip = new AdmZip(await get(url));
  const entry = zip.getEntries().find((e) => /\.csv$/i.test(e.entryName));
  if (!entry) throw new Error("CSV absent de l'archive swisstopo");
  const text = entry.getData().toString("utf8").replace(/^﻿/, "");
  const [header, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const d = header!.includes(";") ? ";" : ",";
  const cols = splitCsv(header!, d).map((c) => c.trim().toLowerCase());
  console.log(`swisstopo : ${cols.join(" | ")}`);
  const idx = (re: RegExp) => cols.findIndex((c) => re.test(c));
  const iName = idx(/ortschaft/);
  const iPlz = idx(/^plz$/);
  const iCommune = idx(/gemeindename/);
  const iBfs = idx(/bfs/);
  const iCanton = idx(/kanton/);
  const iShare = idx(/adressenanteil/);
  return lines.map((l) => {
    const v = splitCsv(l, d);
    return {
      plz: v[iPlz]!.trim(),
      locality: v[iName]!.trim(),
      bfs: Number(v[iBfs]),
      commune: v[iCommune]!.trim(),
      canton: v[iCanton]!.trim(),
      share: Number(String(v[iShare] ?? "").replace("%", "").replace(",", ".")) || 0,
    };
  });
}

const { byBfs, validFrom } = await communeRegions();
const locs = await localities();
const rows: (string | number)[][] = [];
const seen = new Set<string>();
let unmatched = 0;
for (const l of locs.sort((a, b) => a.plz.localeCompare(b.plz) || b.share - a.share)) {
  const r = byBfs.get(l.bfs);
  if (!r) {
    unmatched++;
    continue;
  }
  const key = `${l.plz}|${l.bfs}|${l.locality}`;
  if (seen.has(key)) continue;
  seen.add(key);
  // [code postal, localité, commune, n° OFS, canton, région, part des adresses du code postal en %]
  rows.push([l.plz, l.locality, l.commune, l.bfs, r.canton, r.region, Math.round(l.share * 10) / 10]);
}
console.log(`${rows.length} lignes, ${unmatched} localités sans région (communes hors annexe)`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ validFrom, source: "BAG (régions de primes) + swisstopo (répertoire des localités)", rows }) + "\n");
