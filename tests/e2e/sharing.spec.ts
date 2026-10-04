import { expect, test, type Browser, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { addVirtualAuthenticator, lastMailTo, login } from "./helpers";

/*
 * Comptes et partage, après ritual.spec.ts (qui crée l'administrateur et son foyer « Alex Test ») :
 * un invité s'inscrit sur mobile avec une passkey, un conjoint rejoint le foyer, et un foyer ne
 * voit jamais les données d'un autre.
 */

const shots = path.join("test-results", "screens");
const NEW_PASSWORD = "mot de passe de l'invité";

/** Nouveau contexte de navigation (un autre appareil), avec les réglages du projet (mobile, adresse). */
function newDevice(browser: Browser, info: TestInfo) {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale } = info.project.use;
  return browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale });
}

/** Ouvre une session administrateur sur un appareil à part et en renvoie la page. */
async function adminPage(browser: Browser, info: TestInfo) {
  const context = await newDevice(browser, info);
  const page = await context.newPage();
  await login(page);
  return page;
}

/** Inscription par un lien d'invitation, jusqu'à la page de confirmation de l'adresse. */
async function signUpWith(page: import("@playwright/test").Page, link: string, email: string) {
  await page.goto(link);
  await page.getByLabel("Votre courriel").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirmer").fill(NEW_PASSWORD);
  await page.getByText(/J'accepte que l'app enregistre/).click();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { name: "Vérifiez vos courriels" })).toBeVisible();
  const mail = await lastMailTo(email);
  expect(mail.subject).toBe("Confirmez votre adresse");
  await page.goto(mail.link);
  await page.getByRole("button", { name: "Confirmer mon adresse" }).click();
  await expect(page).toHaveURL(/\/compte\/passkey/);
}

test("un invité crée son compte sur mobile avec une passkey et ne voit rien des autres foyers", async ({ browser }, info) => {
  const admin = await adminPage(browser, info);
  await admin.goto("/foyer");
  const personHref = (await admin.getByRole("link", { name: /Alex Test/ }).first().getAttribute("href"))!;
  expect(personHref).toMatch(/\/foyer\/personne\/\d+/);

  await admin.goto("/admin");
  await admin.getByLabel("Pour qui (note pour vous)").fill("Famille Invitée");
  await admin.getByRole("button", { name: "Créer l'invitation" }).click();
  const link = await admin.getByLabel("Lien d'inscription").inputValue();
  expect(link).toMatch(/\/inscription\?code=/);
  await admin.screenshot({ path: path.join(shots, "a01-administration.png"), fullPage: true });

  const context = await newDevice(browser, info);
  const page = await context.newPage();
  await addVirtualAuthenticator(context, page);
  await signUpWith(page, link, "invite@e2e.test");
  await page.screenshot({ path: path.join(shots, "a02-passkey-proposee.png"), fullPage: true });
  await page.getByRole("button", { name: "Activer la passkey" }).click();
  // Passkey créée, nouveau compte sans foyer : l'accueil guidé suit.
  await expect(page).toHaveURL(/\/bienvenue/);

  // Cloisonnement : les données du foyer de l'administrateur sont introuvables.
  const person = await page.goto(personHref);
  expect(person?.status()).toBe(404);
  await expect(page.getByText("Alex")).toHaveCount(0);
  const backup = await page.request.get("/api/backup");
  expect(backup.status()).toBe(403);
  const adminArea = await page.goto("/admin");
  expect(adminArea?.status()).toBe(404);
  await page.goto("/foyer");
  await expect(page).toHaveURL(/\/bienvenue/);

  // Déconnexion, puis retour avec la passkey seule (ni courriel ni mot de passe).
  await page.goto("/compte");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Se connecter avec une passkey" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/compte");
  await expect(page.getByText("invite@e2e.test")).toBeVisible();
  await expect(page.getByText(/Passkey ajoutée/).first()).toBeVisible();
  await page.screenshot({ path: path.join(shots, "a03-compte.png"), fullPage: true });

  // L'administration voit le compte, jamais le foyer.
  await admin.reload();
  await expect(admin.getByText("invite@e2e.test")).toBeVisible();
  await context.close();
  await admin.context().close();
});

test("le conjoint rejoint le foyer avec le lien du propriétaire", async ({ browser }, info) => {
  const owner = await adminPage(browser, info);
  await owner.goto("/foyer/comptes");
  await owner.getByRole("button", { name: "Inviter une personne" }).click();
  const link = await owner.getByLabel("Lien d'invitation").inputValue();
  await owner.screenshot({ path: path.join(shots, "a04-acces-foyer.png"), fullPage: true });

  const context = await newDevice(browser, info);
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByText("Vous rejoignez un foyer")).toBeVisible();
  await signUpWith(page, link, "conjoint@e2e.test");
  // Sans authentifiant sur cet appareil : la passkey est proposée, on la reporte.
  await page.getByRole("link", { name: "Plus tard" }).click();
  await page.goto("/foyer");
  await expect(page.getByRole("link", { name: /Alex Test/ }).first()).toBeVisible();

  // Membre : il voit les comptes du foyer, ne peut pas inviter, et peut partir.
  await page.goto("/foyer/comptes");
  await expect(page.getByText("conjoint@e2e.test")).toBeVisible();
  await expect(page.getByText("Membre", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inviter une personne" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quitter le foyer" })).toBeVisible();

  // Le propriétaire le voit arriver, et peut lui retirer l'accès.
  await owner.reload();
  await expect(owner.getByText("conjoint@e2e.test")).toBeVisible();
  await owner.getByRole("button", { name: "Retirer", exact: true }).click();
  await owner.getByRole("dialog").getByRole("button", { name: "Retirer" }).click();
  await expect(owner.getByText("conjoint@e2e.test")).toHaveCount(0);
  await page.goto("/foyer");
  await expect(page).toHaveURL(/\/bienvenue/);
  await context.close();
  await owner.context().close();
});

test("un invité télécharge ses données, puis supprime son compte", async ({ browser }, info) => {
  const admin = await adminPage(browser, info);
  await admin.goto("/admin");
  await admin.getByLabel("Pour qui (note pour vous)").fill("Départ");
  await admin.getByRole("button", { name: "Créer l'invitation" }).click();
  const link = await admin.getByLabel("Lien d'inscription").inputValue();

  const context = await newDevice(browser, info);
  const page = await context.newPage();
  await signUpWith(page, link, "depart@e2e.test");
  await page.getByRole("link", { name: "Plus tard" }).click();

  // Mon compte › Mes données : la session vient d'être ouverte, l'identité est confirmée.
  await page.goto("/compte");
  await page.getByRole("link", { name: /Mes données/ }).click();
  await expect(page.getByText("Identité confirmée")).toBeVisible();
  await page.screenshot({ path: path.join(shots, "a05-mes-donnees.png"), fullPage: true });

  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Copie complète/ }).click()]);
  expect(json.suggestedFilename()).toMatch(/^primes-lamal-mes-donnees-.*\.json$/);
  const data = JSON.parse(fs.readFileSync((await json.path())!, "utf8"));
  expect(data.compte.courriel).toBe("depart@e2e.test");
  expect(JSON.stringify(data)).not.toMatch(/Alex Test|admin@e2e\.test/);
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Récapitulatif/ }).click()]);
  expect(fs.readFileSync((await pdf.path())!).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer mon compte" }).click();
  await expect(page).toHaveURL(/\/login\?supprime=1/);
  await expect(page.getByText("Votre compte a été supprimé")).toBeVisible();
  expect((await lastMailTo("depart@e2e.test")).subject).toBe("Votre compte a été supprimé");

  // Plus de connexion possible, et l'administration ne le voit plus.
  await page.getByLabel("Courriel").fill("depart@e2e.test");
  await page.getByLabel("Mot de passe", { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByText(/Courriel ou mot de passe incorrect/)).toBeVisible();
  await admin.reload();
  await expect(admin.getByText("depart@e2e.test")).toHaveCount(0);
  await context.close();
  await admin.context().close();
});
