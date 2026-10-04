import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 3100;
const PINGEN_MOCK_PORT = 3101;
// Chemins absolus : le serveur « standalone » change de répertoire courant au démarrage.
const E2E_DIR = path.resolve(".e2e");
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
    : [
        {
          // Doublure locale de l'API Pingen : l'envoi en recommandé est testé sans rien poster.
          command: `PINGEN_MOCK_PORT=${PINGEN_MOCK_PORT} node --experimental-strip-types --no-warnings tests/pingen-mock.ts`,
          url: `http://127.0.0.1:${PINGEN_MOCK_PORT}/health`,
          reuseExistingServer: false,
          timeout: 30_000,
        },
        {
          command: `rm -rf ${E2E_DIR} && PORT=${PORT} HOSTNAME=127.0.0.1 node .next/standalone/server.js`,
          url: `http://localhost:${PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            DATABASE_PATH: path.join(E2E_DIR, "e2e.db"),
            MIGRATIONS_DIR: path.resolve("drizzle"),
            FAKE_TODAY: "2026-10-05",
            DISABLE_SCHEDULER: "true",
            // Comptes : courriels écrits dans des fichiers, liens vers le serveur de test, pas d'appel à HIBP.
            MAIL_DIR: path.join(E2E_DIR, "mail"),
            APP_URL: `http://localhost:${PORT}`,
            HIBP_DISABLED: "true",
            PINGEN_CLIENT_ID: "client-test",
            PINGEN_CLIENT_SECRET: "secret-test",
            PINGEN_ORGANISATION_ID: "org-test",
            PINGEN_STAGING: "true",
            PINGEN_API_URL: `http://127.0.0.1:${PINGEN_MOCK_PORT}`,
            PINGEN_IDENTITY_URL: `http://127.0.0.1:${PINGEN_MOCK_PORT}`,
          },
        },
      ],
});
