// Génère les icônes PNG de la PWA à partir des SVG (une seule fois, résultat versionné).
// Usage : node scripts/generate-icons.mjs  (nécessite Chromium pour Playwright)
import fs from "node:fs";
import { chromium } from "@playwright/test";

const targets = [
  { src: "public/icons/icon.svg", out: "public/icons/icon-192.png", size: 192 },
  { src: "public/icons/icon.svg", out: "public/icons/icon-512.png", size: 512 },
  { src: "public/icons/maskable.svg", out: "public/icons/maskable-512.png", size: 512 },
  { src: "public/icons/maskable.svg", out: "public/icons/apple-touch-icon.png", size: 180 },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const t of targets) {
  const svg = fs.readFileSync(t.src, "utf8");
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${t.size}" height="${t.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: t.out, omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  console.log("écrit", t.out);
}
await browser.close();
