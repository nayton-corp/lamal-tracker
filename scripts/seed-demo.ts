/**
 * Base de démonstration avec des primes synthétiques (format OFSP) pour essayer l'app
 * ou lancer les tests de bout en bout. N'utilise jamais de vraies données.
 * Usage : DATA_DIR=./demo-data pnpm seed:demo [--today 2026-10-05]
 */
import fs from "node:fs";
import { createContext, fixedClock, systemClock } from "@/application/context";
import { createPerson, saveHousehold, saveLcaPolicy, savePolicy } from "@/application/household";
import { activateDataset, importTariffFile } from "@/application/import-tariffs";
import { databasePath, dataDir, openDatabase } from "@/infrastructure/db/client";
import { diskFileStore } from "@/infrastructure/files";
import { INSURER_SEED } from "@/server/insurer-seed";
import { buildOfspCsv } from "../tests/fixtures/ofsp";

const todayArg = process.argv.indexOf("--today");
const clock = todayArg >= 0 ? fixedClock(process.argv[todayArg + 1]!) : systemClock;
const year = Number(clock.today().slice(0, 4));
const file = databasePath();
if (fs.existsSync(file) && !process.argv.includes("--force")) {
  console.error(`${file} existe déjà : ajoute --force pour l'écraser.`);
  process.exit(1);
}
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });

const ctx = createContext(openDatabase(file), clock, diskFileStore(dataDir()));
ctx.reference.seedInsurers(INSURER_SEED);
for (const [y, inflation] of [
  [year - 1, 0.95],
  [year, 1],
  [year + 1, 1.06],
] as const) {
  const bytes = new TextEncoder().encode(buildOfspCsv({ year: y, inflation, renames: y === year + 1 ? { "8:TEL-MED": "TEL-MED-2" } : {} }));
  const { datasetId } = importTariffFile(ctx, {
    fileName: `demo-praemien-${y}.csv`,
    bytes,
    sourceLabel: "Démo (données synthétiques)",
    sourceUrl: null,
    yearHint: y,
  });
  activateDataset(ctx, datasetId);
}
ctx.reference.saveAddress({
  insurerId: 8,
  validFromYear: 2000,
  recipientName: "CSS Assurance-maladie SA",
  addressLines: ["Case postale 2568", "6002 Lucerne"],
  source: "démo",
  verifiedAt: null,
});
saveHousehold(ctx, { name: "Foyer démo", street: "Rue du Lac 1", npa: "1003", locality: "Lausanne", canton: "VD", region: 1 });
const alex = createPerson(ctx, { firstName: "Alex", lastName: "Démo", birthDate: "1990-05-01" });
const sam = createPerson(ctx, { firstName: "Sam", lastName: "Démo", birthDate: `${year - 18}-03-10` });

const ds = ctx.tariffs.activeDataset(year)!;
const pick = (ageClass: "ADULT" | "KID", accident: boolean, code: string, franchise: number) =>
  ctx.tariffs
    .tariffs({ datasetId: ds.id, canton: "VD", region: 1, ageClass, accidentIncluded: accident, insurerId: 8 })
    .find((t) => t.tariffCode === code && t.franchiseChf === franchise && (ageClass === "ADULT" || t.ageSubgroup === "K1"))!;
const a = pick("ADULT", false, "BASE", 2500);
savePolicy(ctx, {
  personId: alex,
  coverageYear: year,
  insurerId: 8,
  policyNumber: "DEMO-1",
  modelType: "STANDARD",
  franchiseChf: 2500,
  accidentIncluded: false,
  billedMonthlyRp: a.monthlyPremiumRp,
});
const s = pick("KID", true, "TEL-MED", 600);
savePolicy(ctx, {
  personId: sam,
  coverageYear: year,
  insurerId: 8,
  policyNumber: "DEMO-2",
  modelType: "TELMED",
  franchiseChf: 600,
  accidentIncluded: true,
  billedMonthlyRp: s.monthlyPremiumRp,
});
saveLcaPolicy(ctx, null, {
  personId: alex,
  insurerId: 8,
  productName: "myFlex Economy",
  category: "AMBULATORY",
  policyNumber: "DEMO-LCA-1",
  startDate: "2020-01-01",
  noticeMonths: 3,
  bundledDiscount: false,
  monthlyRp: 2450,
});
console.log(`Base de démonstration créée : ${file}`);
