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
  await page.getByText("Importer un fichier à la main").click();
  await page.setInputFiles("#file", path.join(FIXTURES_DIR, file));
  await page.getByRole("button", { name: "Importer le fichier", exact: true }).click();
  await expect(page.getByText(`Primes ${year} importées`)).toBeVisible({ timeout: 60_000 });
}

test("rituel annuel complet sur mobile", async ({ page }) => {
  // Accueil vide → foyer
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /juste prix/ })).toBeVisible();
  await shot(page, "01-accueil-vide");
  await page.getByRole("link", { name: "Commencer" }).click();

  await page.getByLabel("Nom du foyer").fill("Famille Test");
  await page.getByLabel("Rue et numéro").fill("Rue du Lac 1");
  await page.getByLabel("NPA").fill("1003");
  // Le code postal suffit : commune, canton et région sont trouvés.
  await expect(page.getByText(/Lausanne \(VD\) · région de primes 1/)).toBeVisible();
  await expect(page.getByLabel("Localité")).toHaveValue("Lausanne");
  await shot(page, "01b-foyer");
  await page.getByRole("button", { name: "Enregistrer le foyer" }).click();
  await expect(page.getByText("Canton VD · région de primes 1")).toBeVisible();

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
  await sheet.getByLabel("Caisse-maladie").selectOption({ label: "Helsana" });
  await expect(sheet.getByLabel("Produit")).toBeVisible();
  await sheet.getByLabel("Produit").selectOption("HEL-TEL26");
  await sheet.getByLabel("Franchise").selectOption("2500");
  await sheet.getByLabel("Avec accident").uncheck();
  // La prime officielle est reprise sans saisie.
  await expect(sheet.getByText("Prime officielle OFSP")).toBeVisible();
  await sheet.getByText("N° d'assuré (pour les lettres)").click();
  await sheet.getByLabel("Numéro d'assuré").fill("HEL-123");
  await shot(page, "03-contrat");
  await sheet.getByRole("button", { name: "Enregistrer le contrat" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Helsana", { exact: true }).first()).toBeVisible();

  // Complémentaire LCA chez le même groupe
  await page.getByRole("button", { name: "Ajouter une complémentaire LCA" }).click();
  const lca = page.getByRole("dialog");
  // La caisse LAMal de la personne est proposée d'office.
  await expect(lca.getByLabel("Groupe de la caisse LAMal")).toHaveValue(/\d+/);
  await expect(lca.getByLabel("Assureur LCA")).not.toHaveValue("");
  await lca.getByLabel("Garantie").selectOption("HOSPITAL_SEMI_PRIVATE");
  await lca.getByRole("button", { name: "Enregistrer la complémentaire" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await shot(page, "04-personne");

  // Rituel 2027
  await page.getByRole("link", { name: "Rituel" }).click();
  await page.getByRole("button", { name: "Lancer l'analyse 2027" }).click();
  await expect(page.getByText("Votre foyer en 2027, sans rien changer")).toBeVisible();
  // Le tarif renommé entre 2026 et 2027 est retrouvé sans rien demander.
  await expect(page.getByText("Produit à préciser")).toHaveCount(0);
  await shot(page, "05-rituel");

  // Comparateur : renouvellement connu, choisir la meilleure offre
  await page.getByRole("link", { name: "Comparer pour Alex" }).click();
  await expect(page.getByText("Sans rien faire en 2027")).toBeVisible();
  await shot(page, "06-comparateur");
  await page.getByRole("button", { name: "Simulateur de franchise" }).click();
  await expect(page.getByText("Quelle franchise ?")).toBeVisible();
  await shot(page, "07-simulateur");
  await page.getByRole("button", { name: "Fermer" }).click();

  // Deux offres côte à côte
  const offerCards = page.locator("ol > li > details");
  await offerCards.nth(0).locator(":scope > summary").click();
  await expect(offerCards.nth(0).getByText("Année chargée (maximum)")).toBeVisible();
  await expect(offerCards.nth(0).getByText("Premier recours")).toBeVisible();
  await offerCards.nth(0).getByRole("checkbox", { name: /^Comparer/ }).click();
  await expect(offerCards.nth(0).getByRole("checkbox", { name: /^Comparer/ })).toBeChecked();
  await expect(page).toHaveURL(/c=/);
  await offerCards.nth(1).locator(":scope > summary").click();
  await offerCards.nth(1).getByRole("checkbox", { name: /^Comparer/ }).click();
  await expect(offerCards.nth(1).getByRole("checkbox", { name: /^Comparer/ })).toBeChecked();
  await page.getByRole("link", { name: "Comparer 2 offres côte à côte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Comparer des offres" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Premier recours");
  await shot(page, "06b-comparaison");
  await page.goBack();

  const first = page.locator("ol > li > details").first();
  if (!(await first.getAttribute("open"))) await first.locator(":scope > summary").click();
  await first.getByRole("button", { name: /^Choisir/ }).click();
  await expect(page).toHaveURL(/\/rituel\/2027/);
  await expect(page.getByText("Je change de caisse")).toBeVisible();

  // Garde-fou LCA : case + appui long
  await page.getByRole("link", { name: "Contrôle des complémentaires LCA" }).click();
  await expect(page.getByText("Ne résiliez jamais votre LCA par erreur")).toBeVisible();
  await expect(page.getByText("Hospitalisation demi-privée", { exact: true }).first()).toBeVisible();
  await shot(page, "08-lca");
  const hold = page.getByRole("button", { name: "Maintenir pour confirmer" });
  await expect(hold).toBeDisabled();
  await page.getByText(/Je comprends que seule l'assurance de base/).click();
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(1800);
  await page.mouse.up();
  await expect(page.getByText(/Confirmé le/)).toBeVisible();

  // Adresse officielle de l'annuaire OFSP, modifiable au besoin
  await page.goto("/donnees/caisses");
  const helsana = page.locator("details").filter({ has: page.getByText("Helsana", { exact: true }) });
  await helsana.locator("summary").click();
  await expect(helsana.getByText("8081 Zürich")).toBeVisible();
  await helsana.getByRole("button", { name: "Modifier" }).click();
  await helsana.getByLabel("Adresse de résiliation").fill("Case postale\n8081 Zurich");
  await helsana.getByRole("button", { name: "Enregistrer" }).click();
  await expect(helsana.getByText("Caisse enregistrée.")).toBeVisible();
  await helsana.getByRole("button", { name: "Revenir à l'adresse officielle" }).click();
  await expect(helsana.getByText("Adresse officielle rétablie.")).toBeVisible();

  // Démarches : demande à la nouvelle caisse, résiliation, confirmations
  await page.goto("/rituel/2027/lettres");
  await expect(page.getByText("Qui change quoi")).toBeVisible();
  await page.getByRole("button", { name: "Préparer tous les courriers" }).click();
  await expect(page.getByText("2 courrier(s) prêt(s).")).toBeVisible();
  await expect(page.getByText(/avec offre de complémentaires/)).toBeVisible();
  const offerHref = await page.getByRole("link", { name: "Ouvrir le PDF" }).first().getAttribute("href");
  expect(offerHref).toMatch(/\/api\/offers\/\d+\/pdf/);
  const offerPdf = await page.request.get(offerHref!);
  expect((await offerPdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await page.getByRole("button", { name: "Marquer comme envoyée" }).first().click();
  await expect(page.getByRole("button", { name: "Annuler l'envoi" })).toBeVisible();

  const href = await page.getByRole("link", { name: "Ouvrir le PDF" }).last().getAttribute("href");
  expect(href).toMatch(/\/api\/letters\/\d+\/pdf/);
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  await page.getByLabel("N° de suivi").fill("98.00.123456.12345678");
  await page.getByRole("button", { name: "Marquer comme envoyée" }).click();
  await expect(page.getByText("Suivi : 98.00.123456.12345678")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Reçue", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Reçue", exact: true })).toHaveCount(1 - i);
  }
  await expect(page.getByRole("link", { name: /Clôturer le rituel/ })).toBeVisible();
  await shot(page, "09-demarches");

  // Clôture et historique
  await page.goto("/rituel/2027");
  await page.getByRole("button", { name: "Clôturer le rituel 2027" }).click();
  await expect(page.getByText("Clôturé · contrats 2027 créés.")).toBeVisible();
  await page.getByRole("link", { name: "Historique" }).click();
  await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("2027");
  await expect(page.getByText("Économisé grâce aux rituels")).toBeVisible();
  await expect(page.getByText("Parcours de chaque personne")).toBeVisible();
  await shot(page, "10-historique");
  await page.goto("/");
  await shot(page, "11-accueil");
});

test.describe("sur ordinateur", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("navigation latérale, toutes les pages, et retour en arrière sur un rituel clôturé", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    await page.goto("/");
    await expect(nav.getByRole("link", { name: /Foyer/ })).toBeVisible();
    await shot(page, "d01-accueil");
    for (const [name, file] of [["Foyer", "d02-foyer"], ["Historique", "d03-historique"], ["Réglages", "d04-reglages"]] as const) {
      await nav.getByRole("link", { name: new RegExp(name) }).click();
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await shot(page, file);
    }
    await page.goto("/foyer");
    await page.getByRole("link", { name: "Importer une police" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Importer une police" })).toBeVisible();
    await shot(page, "d04b-import-police");
    await page.goto("/foyer");
    await page.getByRole("link", { name: /Alex Test/ }).click();
    await shot(page, "d05-personne");
    await page.getByRole("button", { name: "Ajouter un contrat LAMal" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, "d06-dialogue");
    await page.keyboard.press("Escape");

    // Rituel clôturé : on peut le rouvrir…
    await nav.getByRole("link", { name: /Rituel/ }).click();
    await expect(page.getByText("Clôturé · contrats 2027 créés.")).toBeVisible();
    await shot(page, "d07-rituel-cloture");
    await page.getByRole("button", { name: "Rouvrir le rituel" }).click();
    await page.waitForTimeout(300);
    await shot(page, "d08-confirmation");
    await page.getByRole("dialog").getByRole("button", { name: "Rouvrir" }).click();
    await expect(page.getByRole("button", { name: "Clôturer le rituel 2027" })).toBeVisible();
    await expect(page.getByText("Je change de caisse")).toBeVisible();
    await page.getByRole("link", { name: "Revoir" }).click();
    await expect(page.getByText("Sans rien faire en 2027")).toBeVisible();
    await shot(page, "d09-comparateur");
    await page.goto("/rituel/2027");

    // … ou le supprimer complètement.
    await page.getByRole("button", { name: "Supprimer ce rituel" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Supprimer le rituel" }).click();
    await expect(page.getByRole("button", { name: "Lancer l'analyse 2027" })).toBeVisible();
    await shot(page, "d10-rituel-supprime");
  });
});
