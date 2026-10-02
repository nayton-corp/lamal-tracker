import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { generateFixtures, FIXTURES_DIR } from "../fixtures/generate";
import { writePolicyPdf } from "../fixtures/policy-pdf";

const shots = path.join("test-results", "screens");
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });

test.beforeAll(async () => {
  await generateFixtures();
  await writePolicyPdf(FIXTURES_DIR);
});

const PASSWORD = "e2e-mot-de-passe";

/** Les contextes de navigation suivants n'ont pas le cookie : connexion avec le mot de passe créé au premier test. */
async function login(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrer" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function importFile(page: Page, file: string, year: number) {
  await page.goto("/donnees");
  await page.getByText("Importer un fichier à la main").click();
  await page.setInputFiles("#file", path.join(FIXTURES_DIR, file));
  await page.getByRole("button", { name: "Importer le fichier", exact: true }).click();
  await expect(page.getByText(`Primes ${year} importées`)).toBeVisible({ timeout: 60_000 });
}

test("rituel annuel complet sur mobile", async ({ page }) => {
  // Premier démarrage : l'app exige un mot de passe avant tout.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\/creer/);
  await shot(page, "00-mot-de-passe");
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmer").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le mot de passe" }).click();

  // Première connexion : accueil guidé (pour qui, adresse, personnes, contrats).
  await expect(page).toHaveURL(/\/bienvenue/);
  // Pas de barre de navigation pendant l'accueil.
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /juste prix/ })).toBeVisible();
  await shot(page, "01-accueil-vide");
  await page.getByRole("button", { name: /Pour mon foyer/ }).click();

  await expect(page.getByRole("heading", { name: "Où habite votre foyer ?" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Depuis ma police/ })).toBeVisible();
  await page.getByRole("radio", { name: /Saisir à la main/ }).click();
  await page.getByLabel("Rue et numéro").fill("Rue du Lac 1");
  await page.getByLabel("NPA").fill("1003");
  // Le code postal suffit : commune, canton et région sont trouvés.
  await expect(page.getByText(/Lausanne \(VD\) · région de primes 1/)).toBeVisible();
  await expect(page.getByLabel("Localité")).toHaveValue("Lausanne");
  await shot(page, "01b-foyer");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { name: "Qui est assuré dans votre foyer ?" })).toBeVisible();

  // Primes officielles 2026 et 2027
  await importFile(page, "primes-2026.xlsx", 2026);
  await importFile(page, "primes-2027.xlsx", 2027);
  await shot(page, "02-donnees");

  // Personnes, puis contrat 2026 par la saisie guidée (la prime officielle est retrouvée).
  await page.goto("/bienvenue?etape=membres");
  await page.getByLabel("Prénom").fill("Alex");
  await page.getByLabel("Nom", { exact: true }).fill("Test");
  await page.getByLabel("Date de naissance").fill("1988-04-12");
  await page.getByRole("button", { name: "Ajouter cette personne" }).click();
  await expect(page.getByText("Alex Test")).toBeVisible();
  await page.getByRole("link", { name: /C'est tout le monde/ }).click();

  await expect(page.getByRole("heading", { name: "Les contrats actuels" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Importer la police/ })).toBeVisible();
  await shot(page, "03a-contrats");
  await page.getByRole("radio", { name: /Saisie guidée/ }).click();
  await page.getByLabel("Rechercher une caisse").fill("hels");
  await page.getByRole("button", { name: "Helsana", exact: true }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("radio", { name: /Télémédecine/ }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "CHF 2500" }).click();
  await page.getByLabel("Couverture accidents comprise").uncheck();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Prime officielle OFSP")).toBeVisible();
  await page.getByLabel(/N° d'assuré/).fill("HEL-123");
  await shot(page, "03-contrat");
  await page.getByRole("button", { name: "Enregistrer le contrat" }).click();
  await expect(page.getByText(/Helsana · franchise 2500/)).toBeVisible();
  await page.getByRole("link", { name: /voir mon tableau de bord/ }).click();

  // Fenêtre du rituel ouverte : l'accueil montre la reconduction tacite.
  await expect(page.getByText("Sans rien faire, en 2027 vous paierez")).toBeVisible();
  await expect(page.getByText(/Sans courrier, votre caisse renouvelle/)).toBeVisible();
  // Rituel ouvert : l'accueil ne prétend pas qu'il n'y a rien à faire.
  await expect(page.getByText("Rien à faire pour le moment.")).toHaveCount(0);
  // Les démarches n'ont pas de sens avant une décision : retour au rituel.
  await page.goto("/rituel/2027/lettres");
  await expect(page).toHaveURL(/\/rituel\/2027$/);
  await shot(page, "03b-accueil-reconduction");

  await page.goto("/foyer");
  await page.getByRole("link", { name: /Alex Test/ }).click();
  await expect(page.getByRole("heading", { name: "Alex Test" })).toBeVisible();

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

  // Rituel 2027 : reconduction, stratégie, besoins, comparaison
  await page.getByRole("link", { name: "Rituel" }).click();
  await expect(page.getByText("Sans rien faire, en 2027 vous paierez")).toBeVisible();
  // Le tarif renommé entre 2026 et 2027 est retrouvé sans rien demander.
  await expect(page.getByText("Produit à préciser")).toHaveCount(0);
  await shot(page, "05-rituel");
  await page.getByRole("link", { name: "Choisir ma stratégie" }).first().click();
  await expect(page.getByRole("heading", { name: "Quelle stratégie ?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maintien" })).toBeVisible();
  await shot(page, "05b-strategie");
  await page.getByRole("button", { name: "Choisir « Économie max »" }).click();
  await expect(page.getByRole("heading", { name: "Votre besoin" })).toBeVisible();
  await page.getByRole("radio", { name: /Quelques consultations/ }).check();
  await shot(page, "05c-besoins");
  await page.getByRole("button", { name: "Comparer les offres" }).click();

  // Comparateur : renouvellement connu, top 3 de la stratégie, choisir la meilleure offre
  await expect(page.getByText("Sans rien faire en 2027")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Top 3 · Économie max/ })).toBeVisible();
  await expect(page.getByText("Selon chaque stratégie")).toBeVisible();
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
  // Dernier choix fait : l'app enchaîne sur l'étape suivante, le garde-fou LCA (case à cocher puis confirmation).
  await expect(page).toHaveURL(/\/rituel\/2027\/lca/);
  await expect(page.getByText("Ne résiliez jamais votre LCA par erreur")).toBeVisible();
  await expect(page.getByText("Hospitalisation demi-privée", { exact: true }).first()).toBeVisible();
  await shot(page, "08-lca");
  const confirm = page.getByRole("button", { name: "J'ai compris, confirmer" });
  await expect(confirm).toBeDisabled();
  await page.getByText(/Seule l'assurance de base de Alex/).click();
  await confirm.click();
  await expect(page.getByText(/Confirmé le/)).toBeVisible();
  await page.goto("/rituel/2027");
  await expect(page.getByText("Je change de caisse")).toBeVisible();
  await expect(page.getByRole("link", { name: "Faire les démarches" })).toBeVisible();

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
  // Signature à l'écran, apposée sur les courriers PDF.
  await page.getByRole("button", { name: "Signer à l'écran" }).click();
  const pad = page.getByLabel("Zone de signature de Alex");
  await expect(pad).toBeVisible();
  await page.waitForTimeout(600); // fin de l'animation du panneau
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 8 });
  await page.mouse.move(box.x + box.width - 30, box.y + box.height - 20, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Enregistrer la signature" }).click();
  await expect(page.getByRole("img", { name: "Signature de Alex" })).toBeVisible();
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
    await login(page);
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
    // Les primes sont publiées : une analyse vierge s'ouvre, sans aucun choix.
    await expect(page.getByRole("link", { name: "Choisir ma stratégie" }).first()).toBeVisible();
    await expect(page.getByText("Je change de caisse")).toHaveCount(0);
    await shot(page, "d10-rituel-supprime");
  });
});

test("recommencer à zéro, puis une personne seule depuis sa police PDF", async ({ page }) => {
  await login(page);

  // Réglages › Sécurité : tout effacer, mot de passe à l'appui.
  await page.goto("/donnees");
  await page.getByRole("button", { name: "Recommencer à zéro" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Votre mot de passe, pour confirmer").fill(PASSWORD);
  await sheet.getByRole("button", { name: "Tout effacer" }).click();
  await expect(page).toHaveURL(/\/bienvenue/);
  await expect(page.getByRole("heading", { name: /juste prix/ })).toBeVisible();

  // Seul·e : identité, adresse et contrat lus dans la police, en une étape.
  await page.getByRole("button", { name: /Pour moi seul/ }).click();
  await expect(page.getByRole("heading", { name: "Qui êtes-vous ?" })).toBeVisible();
  await page.getByRole("radio", { name: /Depuis ma police/ }).click();
  await page.getByLabel("PDF de la police").setInputFiles(path.join(FIXTURES_DIR, "police-2026.pdf"));
  await expect(page.getByText("Police Helsana 2026")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Prénom 1")).toHaveValue("Alex");
  await expect(page.getByLabel("Nom 1", { exact: true })).toHaveValue("Test");
  await expect(page.getByLabel("Date de naissance 1")).toHaveValue("1988-04-12");
  await expect(page.getByLabel("Rue et numéro")).toHaveValue("Rue du Lac 1");
  await expect(page.getByText(/Lausanne \(VD\) · région de primes 1/)).toBeVisible();
  await shot(page, "s01-police-lue");
  await page.getByRole("button", { name: "Confirmer et lire les contrats" }).click();
  await expect(page.getByText(/Profil créé/)).toBeVisible();
  // Le numéro d'assuré (AVS) et le tarif sont repris de la police.
  await expect(page.getByLabel("N° d'assuré")).toHaveValue("756.1234.5678.97");
  await expect(page.getByText("Tarif officiel retrouvé")).toBeVisible();
  await shot(page, "s02-contrat-lu");
  await page.getByRole("button", { name: "Enregistrer le contrat 2026" }).click();
  await expect(page).toHaveURL(/etape=contrats/);
  await expect(page.getByText(/Helsana · franchise 2500/)).toBeVisible();
  await page.getByRole("link", { name: /voir mon tableau de bord/ }).click();
  await expect(page.getByRole("heading", { name: "Bonjour Alex" })).toBeVisible();
  // Libellés au singulier en mode solo.
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Moi" })).toBeVisible();
  await shot(page, "s03-accueil-solo");
});
