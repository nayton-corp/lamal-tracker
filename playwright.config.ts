import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// E2E_BASE_URL : teste un serveur déjà lancé (ex. le conteneur Docker) au lieu du build local.
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    locale: "fr-CH",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: external
    ? undefined
    : {
    command: `rm -rf .e2e && PORT=${PORT} HOSTNAME=127.0.0.1 node .next/standalone/server.js`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_PATH: ".e2e/e2e.db",
      MIGRATIONS_DIR: "drizzle",
      FAKE_TODAY: "2026-10-05",
      DISABLE_SCHEDULER: "true",
    },
  },
});
