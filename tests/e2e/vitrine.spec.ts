import { expect, test } from "@playwright/test";
import path from "node:path";
import { expectAccessible, lastMailTo, login, ADMIN_EMAIL } from "./helpers";

/*
 * Ce que voit une personne sans compte (présentation, pages légales, erreurs), puis l'avis envoyé
 * depuis l'app et les chiffres de l'administration. Tourne après ritual.spec.ts (compte créé).
 */
const shots = path.join("test-results", "screens");

test("présentation publique et pages légales, accessibles sans compte", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("moins chère chaque automne");
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);
  await expect(page.getByText("Aucune commission")).toBeVisible();
  await expect(page.getByRole("img", { name: /Écran du bilan annuel/ }).first()).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({ path: path.join(shots, "v01-presentation.png"), fullPage: true });

  await page.getByRole("link", { name: "Conditions d'utilisation" }).click();
  await expect(page.getByRole("heading", { name: "Conditions d'utilisation" })).toBeVisible();
  await expect(page.getByText(/c'est vous qui les vérifiez, les signez, les envoyez/)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Mentions légales" }).click();
  await expect(page.getByRole("heading", { name: "Mentions légales" })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Confidentialité" }).click();
  await expect(page.getByRole("heading", { name: "Confidentialité" })).toBeVisible();
  await expectAccessible(page);

  await page.goto("/");
  await page.getByRole("link", { name: "J'ai une invitation" }).first().click();
  await expect(page).toHaveURL(/\/inscription/);
  await expectAccessible(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Se connecter" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await expectAccessible(page);

  // Politique de contenu stricte (scripts à nonce) et adresse de signalement des failles.
  const login = await page.request.get("/login");
  expect(login.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(login.headers()["permissions-policy"]).toContain("camera=()");
  const securityTxt = await page.request.get("/.well-known/security.txt");
  expect(await securityTxt.text()).toContain("Contact: mailto:securite@e2e.test");

  // Une page privée sans session mène toujours à la connexion, avec retour prévu.
  await page.goto("/foyer");
  await expect(page).toHaveURL(/\/login\?next=%2Ffoyer/);
});

test("un avis envoyé depuis l'app arrive dans l'administration, avec les chiffres d'usage", async ({ page }) => {
  await login(page);
  const missing = await page.goto("/rien-ici");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();

  await page.goto("/donnees");
  await expect(page.getByText("Installer sur l'écran d'accueil")).toBeVisible();
  await page.getByText("Sur iPhone ou iPad (Safari)").click();
  await expect(page.getByText(/Sur l'écran d'accueil/)).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: /Donner un avis/ }).click();
  await expect(page.getByRole("heading", { name: "Donner un avis" })).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Une idée").check();
  await page.getByLabel("Votre message").fill("Un rappel par SMS serait pratique.");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText("Merci ! Votre avis est bien arrivé.")).toBeVisible();
  // L'administrateur est prévenu sans que le texte de l'avis soit dans le courriel.
  const mail = await lastMailTo(ADMIN_EMAIL);
  expect(mail.subject).toBe("Nouvel avis : une idée");
  expect(mail.text).not.toContain("SMS");

  await page.goto("/admin");
  await expect(page.getByText("Avis reçus (1 non lu)")).toBeVisible();
  await expect(page.getByText("Un rappel par SMS serait pratique.")).toBeVisible();
  await expect(page.getByText("Comptes créés en tout")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Marquer lu" }).click();
  await expect(page.getByText("Avis reçus", { exact: true })).toBeVisible();
});
