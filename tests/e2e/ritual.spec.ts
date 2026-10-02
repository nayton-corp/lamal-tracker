import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("rituel d'automne complet : hausse, choix, garde-fou LCA, lettre PDF", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bonjour Alex" })).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le rituel 2027" }).click();

  // Tableau de bord : une carte par personne avec la hausse 2027
  const alexCard = page.getByRole("link").filter({ hasText: "Alex" }).filter({ hasText: "Hausse 2027" });
  const samCard = page.getByRole("link").filter({ hasText: "Sam" }).filter({ hasText: "Hausse 2027" });
  await expect(alexCard).toBeVisible();
  await expect(alexCard).toContainText("hausse");
  await expect(samCard).toContainText("Change de classe d'âge");

  // Alex change de caisse pour la meilleure offre
  await alexCard.click();
  const best = page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: "Choisir" }) })
    .first();
  await expect(best).toBeVisible();
  await best.getByRole("button", { name: "Choisir" }).click();
  const guardLink = page.getByRole("link", { name: "Garde-fou LCA" });
  await expect(guardLink).toBeVisible();

  // La lettre n'est accessible qu'après le garde-fou LCA
  await guardLink.click();
  const hold = page.getByRole("button", { name: "Maintenir pour confirmer" });
  await expect(hold).toBeDisabled();
  await page.getByRole("checkbox").check();
  // Un simple clic ne suffit pas
  await hold.click();
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/lca$/);
  // Appui long de 1,5 s
  await hold.hover();
  await page.mouse.down();
  await page.waitForTimeout(1_800);
  await page.mouse.up();
  await expect(page).toHaveURL(/\/rituel\/2027\/lettres/);

  // Génération de la lettre pour la CSS
  await page.getByRole("button", { name: "Générer la lettre PDF" }).click();
  const pdfLink = page.locator('a[href*="/api/letters/"][href$="/pdf"]').first();
  await expect(pdfLink).toBeVisible();
  const pdf = await request.get((await pdfLink.getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: "Marquer comme envoyée" }).click();
  await expect(page.getByRole("button", { name: "Mettre à jour l'envoi" })).toBeVisible();
});

test("Sam garde son contrat ; l'historique montre l'année projetée", async ({ page }) => {
  await page.goto("/rituel/2027");
  await page.getByRole("link").filter({ hasText: "Sam" }).filter({ hasText: "Hausse 2027" }).click();
  await page.getByRole("button", { name: "Je reste" }).click();
  await expect(page.getByText("Je reste tel quel")).toBeVisible();

  await page.goto("/historique");
  await expect(page.getByText("projeté").first()).toBeVisible();
});

test("comparateur libre et réglages tiennent sur un écran de téléphone", async ({ page }) => {
  await page.goto("/comparer");
  await expect(page.getByRole("heading", { name: "Comparer" })).toBeVisible();
  await page.getByRole("link", { name: "1000", exact: true }).click();
  await expect(page.getByText(/Marché franchise 1000/)).toBeVisible();
  await expect(page.locator("ol article").first()).toContainText("Franchise 1000");

  await page.goto("/reglages/primes");
  await expect(page.getByText("Primes 2027", { exact: true })).toBeVisible();
  // Petit téléphone (360 px) : aucune page ne doit défiler horizontalement
  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of [
    "/",
    "/foyer",
    "/comparer",
    "/historique",
    "/reglages",
    "/rituel/2027",
    "/rituel/2027/1",
    "/rituel/2027/2",
    "/rituel/2027/lettres",
    "/reglages/primes/3",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `défilement horizontal sur ${path}`).toBeLessThanOrEqual(1);
  }
});
