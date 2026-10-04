import { expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { totpCode, totpStep } from "../../src/application/totp";

/*
 * Outils partagés des tests de bout en bout. Le compte administrateur est créé par le premier test
 * (ritual.spec.ts) ; son secret TOTP et ses codes de secours sont gardés dans .e2e/admin.json pour
 * les connexions suivantes (un code de secours par connexion : jamais deux fois le même code TOTP).
 */

export const ADMIN_EMAIL = "admin@e2e.test";
export const PASSWORD = "e2e-mot-de-passe";
const E2E_DIR = path.resolve(".e2e");
const ADMIN_FILE = path.join(E2E_DIR, "admin.json");
export const MAIL_DIR = path.join(E2E_DIR, "mail");

interface AdminSecrets {
  secret: string;
  codes: string[];
}

export function saveAdminSecrets(secrets: AdminSecrets) {
  fs.mkdirSync(E2E_DIR, { recursive: true });
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(secrets));
}

function nextRecoveryCode(): string {
  const secrets = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8")) as AdminSecrets;
  const code = secrets.codes.shift();
  if (!code) throw new Error("Plus de code de secours pour les tests");
  saveAdminSecrets(secrets);
  return code;
}

export const currentTotp = (secret: string) => totpCode(secret, totpStep(Date.now()));

/** Connexion de l'administrateur : courriel, mot de passe, puis code de secours. */
export async function login(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Courriel").fill(ADMIN_EMAIL);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/code/);
  await page.getByLabel("Code à 6 chiffres").fill(nextRecoveryCode());
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Dernier courriel reçu par cette adresse (transport fichier MAIL_DIR du serveur de test). */
export async function lastMailTo(to: string): Promise<{ subject: string; text: string; link: string }> {
  let found: { to: string; subject: string; text: string } | undefined;
  await expect
    .poll(() => {
      const files = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).sort() : [];
      found = files
        .map((f) => JSON.parse(fs.readFileSync(path.join(MAIL_DIR, f), "utf8")) as { to: string; subject: string; text: string })
        .filter((m) => m.to === to)
        .at(-1);
      return Boolean(found);
    })
    .toBe(true);
  const link = /(https?:\/\/\S+)/.exec(found!.text)?.[1] ?? "";
  return { subject: found!.subject, text: found!.text, link };
}

/** Authentifiant WebAuthn simulé (Face ID / empreinte) pour ce contexte de navigation. */
export async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
}
