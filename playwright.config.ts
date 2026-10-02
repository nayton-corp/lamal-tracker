import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const DATA_DIR = ".e2e-data";

/** Tests de bout en bout sur l'app compilée (`pnpm build` d'abord), avec une base de démonstration à date fixe. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "fr-CH",
    timezoneId: "Europe/Zurich",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm seed:demo --force --today 2026-10-05 && pnpm start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATA_DIR, LAMAL_TODAY: "2026-10-05", JOBS_DISABLED: "1" },
  },
});
