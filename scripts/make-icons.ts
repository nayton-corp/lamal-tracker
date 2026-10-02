/** Génère les icônes PNG de la PWA à partir des SVG (via Chromium de Playwright). */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "icons");
const targets: [string, string, number][] = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["maskable.svg", "apple-touch-icon.png", 180],
  ["maskable.svg", "maskable-512.png", 512],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
for (const [src, out, size] of targets) {
  const svg = fs.readFileSync(path.join(dir, src), "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(dir, out), omitBackground: true });
}
await browser.close();
console.log("icônes générées");
