import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { generateFixtures, FIXTURES_DIR } from "../fixtures/generate";

const shots = path.join("test-results", "screens");
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });

test.beforeAll(async () => {
  await generateFixtures();
});

async function importFile(page: Page, file: string, year: number) {
  await page.goto("/donnees");
  await page.setInputFiles("#file", path.join(FIXTURES_DIR, file));
  await page.getByRole("button", { name: "Importer le fichier", exact: true }).click();
  await expect(page.getByText(`Primes ${year} importées`)).toBeVisible({ timeout: 60_000 });
}

test("rituel annuel complet sur mobile", async ({ page }) => {
  // Accueil vide → foyer
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /rituel d'automne/ })).toBeVisible();
  await shot(page, "01-accueil-vide");
  await page.getByRole("link", { name: "Commencer" }).click();

  await page.getByLabel("Nom du foyer").fill("Famille Test");
  await page.getByLabel("Rue et numéro").fill("Rue du Lac 1");
  await page.getByLabel("NPA").fill("1003");
  await page.getByLabel("Localité").fill("Lausanne");
  await page.getByLabel("Canton").selectOption("VD");
  await page.getByLabel("Région de primes").selectOption("1");
  await page.getByRole("button", { name: "Enregistrer le foyer" }).click();
  await expect(page.getByText("Foyer enregistré.")).toBeVisible();

  // Primes officielles 2026 et 2027
  await importFile(page, "primes-2026.xlsx", 2026);
  await importFile(page, "primes-2027.xlsx", 2027);
  await shot(page, "02-donnees");

  // Personne + contrat 2026 pré-rempli depuis les données OFSP
  await page.goto("/foyer/personne/nouvelle");
  await page.getByLabel("Prénom").fill("Alex");
  await page.getByLabel("Nom", { exact: true }).fill("Test");
  await page.getByLabel("Date de naissance").fill("1988-04-12");
  await page.getByRole("button", { name: "Ajouter la personne" }).click();
  await expect(page.getByRole("heading", { name: "Alex Test" })).toBeVisible();

  await page.getByRole("button", { name: "Ajouter un contrat LAMal" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Année").selectOption("2026");
  await sheet.getByLabel("N° d'assuré").fill("HEL-123");
  await sheet.getByLabel("Caisse-maladie (LAMal)").selectOption({ label: "Helsana Versicherungen AG" });
  await expect(sheet.getByLabel("Tarif (données OFSP)")).toBeVisible();
  await sheet.getByLabel("Tarif (données OFSP)").selectOption("HEL-TEL26");
  await sheet.getByLabel("Franchise (CHF)").selectOption("2500");
  await expect(sheet.getByLabel("Prime mensuelle facturée (CHF)")).not.toHaveValue("");
  await shot(page, "03-contrat");
  await sheet.getByRole("button", { name: "Enregistrer le contrat" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Helsana Versicherungen AG").first()).toBeVisible();

  // Complémentaire LCA chez le même groupe
  await page.getByRole("button", { name: "Ajouter une complémentaire LCA" }).click();
  const lca = page.getByRole("dialog");
  await lca.getByLabel("Assureur LCA").fill("Helsana Assurances complémentaires SA");
  await lca.getByLabel("Groupe de la caisse LAMal").selectOption({ label: "Helsana Versicherungen AG" });
  await lca.getByLabel("Produit").fill("Hospitalisation mi-privée");
  await lca.getByRole("button", { name: "Enregistrer la complémentaire" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await shot(page, "04-personne");

  // Rituel 2027
  await page.getByRole("link", { name: "Rituel" }).click();
  await page.getByRole("button", { name: "Lancer l'analyse 2027" }).click();
  await expect(page.getByText("Votre foyer en 2027, sans rien changer")).toBeVisible();
  await expect(page.getByText("Tarif à confirmer")).toBeVisible();
  await shot(page, "05-rituel");

  // Comparateur : confirmer le renouvellement puis choisir la meilleure offre
  await page.getByRole("link", { name: "Comparer pour Alex" }).click();
  await page.getByRole("button", { name: "C'est celui-ci" }).first().click();
  await expect(page.getByText("Sans rien faire en 2027")).toBeVisible();
  await shot(page, "06-comparateur");
  await page.getByRole("button", { name: "Simulateur de franchise" }).click();
  await expect(page.getByText("Quelle franchise ?")).toBeVisible();
  await shot(page, "07-simulateur");
  await page.getByRole("button", { name: "Fermer" }).click();

  const first = page.locator("ol > li details").first();
  await first.locator("summary").click();
  await first.getByRole("button", { name: /^Choisir/ }).click();
  await expect(page).toHaveURL(/\/rituel\/2027/);
  await expect(page.getByText("Je change de caisse")).toBeVisible();

  // Garde-fou LCA : case + appui long
  await page.getByRole("link", { name: "Contrôle des complémentaires LCA" }).click();
  await expect(page.getByText("Ne résiliez jamais votre LCA par erreur")).toBeVisible();
  await expect(page.getByText("Hospitalisation mi-privée", { exact: true })).toBeVisible();
  await shot(page, "08-lca");
  const hold = page.getByRole("button", { name: "Maintenir pour confirmer" });
  await expect(hold).toBeDisabled();
  await page.getByText(/Je comprends que seule l'assurance de base/).click();
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(1800);
  await page.mouse.up();
  await expect(page.getByText(/Confirmé le/)).toBeVisible();

  // Lettres : bloquées sans adresse, puis générées
  await page.goto("/rituel/2027/lettres");
  await page.getByRole("button", { name: "Générer les lettres" }).click();
  await expect(page.getByText(/Adresse de la caisse actuelle manquante/)).toBeVisible();

  await page.goto("/donnees/caisses");
  const helsana = page.locator("details", { hasText: "Helsana Versicherungen AG" });
  await helsana.locator("summary").click();
  await helsana.getByLabel("Adresse de résiliation").fill("Case postale\n8081 Zurich");
  await helsana.getByRole("button", { name: "Enregistrer" }).click();
  await expect(helsana.getByText("Caisse enregistrée.")).toBeVisible();

  await page.goto("/rituel/2027/lettres");
  await page.getByRole("button", { name: "Générer les lettres" }).click();
  await expect(page.getByText("1 lettre(s) prête(s).")).toBeVisible();
  await expect(page.getByText("Résiliation LAMal")).toBeVisible();

  const href = await page.getByRole("link", { name: "Ouvrir le PDF" }).getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  await page.getByLabel("N° de suivi").fill("98.00.123456.12345678");
  await page.getByRole("button", { name: "Marquer comme envoyée" }).click();
  await expect(page.getByText(/Envoyée le 05.10.2026/)).toBeVisible();
  await shot(page, "09-lettres");

  // Clôture et historique
  await page.goto("/rituel/2027");
  await page.getByRole("button", { name: "Clôturer le rituel 2027" }).click();
  await expect(page.getByText("Clôturé · contrats 2027 créés.")).toBeVisible();
  await page.getByRole("link", { name: "Historique" }).click();
  await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("2027");
  await shot(page, "10-historique");
  await page.goto("/");
  await shot(page, "11-accueil");
});
