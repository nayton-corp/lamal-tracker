import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { generateFixtures, FIXTURES_DIR } from "../fixtures/generate";
import { writePolicyPdf } from "../fixtures/policy-pdf";
import { ADMIN_EMAIL, currentTotp, expectAccessible, login, PASSWORD, saveAdminSecrets } from "./helpers";

const shots = path.join("test-results", "screens");
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });

test.beforeAll(async () => {
  await generateFixtures();
  await writePolicyPdf(FIXTURES_DIR);
});


async function importFile(page: Page, file: string, year: number) {
  await page.goto("/donnees");
  await page.getByText("Importer un fichier à la main").click();
  await page.setInputFiles("#file", path.join(FIXTURES_DIR, file));
  await page.getByRole("button", { name: "Importer le fichier", exact: true }).click();
  await expect(page.getByText(`Primes ${year} importées`)).toBeVisible({ timeout: 60_000 });
}

test("bilan annuel complet sur mobile", async ({ page }) => {
  // Premier démarrage : l'app exige le compte administrateur avant tout.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\/creer/);
  await shot(page, "00-mot-de-passe");
  await page.getByLabel("Votre courriel").fill(ADMIN_EMAIL);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmer").fill(PASSWORD);
  if (!process.env.E2E_BASE_URL) {
    // Sans le code d'installation du serveur, personne ne prend la place de l'administrateur.
    await page.getByLabel("Code d'installation").fill("mauvais-code");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    await expect(page.getByText("Code d'installation incorrect.")).toBeVisible();
    // Le formulaire est vidé après chaque envoi : tout est ressaisi.
    await page.getByLabel("Votre courriel").fill(ADMIN_EMAIL);
    await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirmer").fill(PASSWORD);
    await page.getByLabel("Code d'installation").fill("code-installation-e2e");
  }
  await page.getByRole("button", { name: "Créer le compte" }).click();

  // L'administrateur protège d'abord son compte d'un second facteur : rien d'autre n'est accessible.
  await expect(page).toHaveURL(/\/compte\?requis=1/);
  await expect(page.getByText("Protégez votre compte administrateur")).toBeVisible();
  await page.goto("/foyer");
  await expect(page).toHaveURL(/\/compte\?requis=1/);
  await page.getByRole("button", { name: "Activer le double facteur" }).click();
  const totp = page.getByRole("dialog");
  await totp.getByLabel("Votre mot de passe, pour confirmer").fill(PASSWORD);
  await totp.getByRole("button", { name: "Continuer" }).click();
  const secret = (await totp.getByTestId("totp-secret").textContent())!.trim();
  await expect(totp.getByRole("img", { name: /QR code/ })).toBeVisible();
  await shot(page, "00b-double-facteur");
  await totp.getByLabel("Code affiché par l'application").fill(currentTotp(secret));
  await totp.getByRole("button", { name: "Activer" }).click();
  const codesSheet = page.getByRole("dialog", { name: "Codes de secours" });
  const codeItems = codesSheet.getByRole("list", { name: "Codes de secours" }).getByRole("listitem");
  await expect(codeItems).toHaveCount(10);
  const codes = await codeItems.allTextContents();
  saveAdminSecrets({ secret, codes });
  await codesSheet.getByRole("button", { name: "J'ai noté mes codes" }).click();
  await expect(page.getByText("Protégez votre compte administrateur")).toHaveCount(0);

  // Première connexion : accueil guidé (pour qui, adresse, personnes, contrats).
  await page.goto("/");
  await expect(page).toHaveURL(/\/bienvenue/);
  // Pas de barre de navigation pendant l'accueil.
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /juste prix/ })).toBeVisible();
  await shot(page, "01-accueil-vide");
  await expectAccessible(page);
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
  await expectAccessible(page);

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
  await expectAccessible(page);
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

  // Fenêtre du bilan ouverte : la carte de l'année montre la reconduction tacite, un seul bouton.
  const card = page.locator("section", { has: page.locator("#carte-annee") });
  await expect(card.getByText("Sans rien faire, en 2027")).toBeVisible();
  await expect(card.getByRole("link", { name: /Commencer le bilan/ })).toBeVisible();
  await expect(card.getByText(/Hausse de \+CHF/)).toBeVisible();
  // Le détail par personne se déplie en touchant la carte.
  await expect(card.getByText("Helsana, sans rien changer")).toBeHidden();
  await card.getByText("Détail", { exact: true }).click();
  await expect(card.getByText("Helsana, sans rien changer")).toBeVisible();
  // Les autres tâches, sans répéter celle de la carte ; le compte a déjà son double facteur.
  await expect(page.getByRole("heading", { name: "À faire" })).toBeVisible();
  await expect(page.getByText(/Voir la hausse 2027/)).toHaveCount(0);
  await expect(page.getByText("Sécuriser votre compte")).toHaveCount(0);
  await shot(page, "03a-accueil-carte");
  await expectAccessible(page);
  // Les démarches n'ont pas de sens avant une décision : retour au bilan.
  await page.goto("/bilan/2027/lettres");
  await expect(page).toHaveURL(/\/bilan\/2027$/);
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
  await expectAccessible(page);

  // Bilan 2027 : reconduction, préférences, comparaison
  await page.getByRole("link", { name: "Bilan" }).click();
  await expect(page.getByText(/Pour changer, courrier reçu par la caisse au plus tard le/)).toBeVisible();
  await expect(page.locator("#carte-annee")).toHaveCount(0);
  // Le tarif renommé entre 2026 et 2027 est retrouvé sans rien demander.
  await expect(page.getByText("Produit à préciser")).toHaveCount(0);
  await shot(page, "05-bilan");
  await expectAccessible(page);
  await page.getByRole("link", { name: "Régler mes préférences" }).first().click();
  await expect(page.getByRole("heading", { name: "Vos préférences" })).toBeVisible();
  // Changer de stratégie remet les réglages fins à ceux qu'elle propose.
  await page.getByText("Ne rien changer au quotidien").click();
  await expect(page.getByText(/Franchise \d+ · /)).toBeVisible();
  await page.getByText("Payer le moins possible").click();
  await expect(page.getByText("Franchise la plus avantageuse · tous les modèles")).toBeVisible();
  await page.getByRole("radio", { name: /Quelques consultations/ }).check();
  await shot(page, "05b-preferences");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Comparer les offres" }).click();

  // Comparateur : renouvellement connu, top 3 par coût réel, choisir la meilleure offre
  await expect(page.getByText("Sans rien faire en 2027")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top 3 en 2027" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Selon mes préférences" })).toBeChecked();
  await shot(page, "06-comparateur");
  await expectAccessible(page);
  await page.getByRole("radio", { name: "Toutes les offres" }).click();
  await expect(page).toHaveURL(/all=1/);
  await expect(page.getByRole("radio", { name: "Toutes les offres" })).toBeChecked();
  await page.getByRole("radio", { name: "Selon mes préférences" }).click();
  await expect(page).not.toHaveURL(/all=1/);
  // Les anciennes adresses mènent aux préférences.
  const comparer = page.url();
  await page.goto("/bilan/2027/strategie");
  await expect(page).toHaveURL(/\/bilan\/2027\/preferences/);
  // Les liens d'avant le changement de nom (« rituel ») mènent au bilan.
  await page.goto("/rituel/2027/preferences");
  await expect(page).toHaveURL(/\/bilan\/2027\/preferences$/);
  await page.goto(comparer);

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
  // Dernier choix fait : l'app enchaîne directement sur les démarches (plus d'étape LCA séparée).
  await expect(page).toHaveURL(/\/bilan\/2027\/lettres/);
  await page.goto("/bilan/2027");
  await expect(page.getByText("Je change de caisse")).toBeVisible();
  await expect(page.getByRole("link", { name: "Envoyer les courriers" })).toBeVisible();
  // L'ancienne adresse de l'étape LCA mène aux démarches.
  await page.goto("/bilan/2027/lca");
  await expect(page).toHaveURL(/\/bilan\/2027\/lettres/);

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
  await page.goto("/bilan/2027/lettres");
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
  // Envoi papier guidé : date limite, signatures, recommandé, numéro de suivi.
  await page.getByText("Comment envoyer en recommandé").click();
  await expect(page.getByText(/À poster au plus tard le lundi 23 novembre 2026/)).toBeVisible();
  await expect(page.getByText(/Signez à la main/)).toBeVisible();
  await expectAccessible(page);
  await expect(page.getByText(/avec offre de complémentaires/)).toBeVisible();
  // Rappel sous la résiliation : les complémentaires continuent.
  await expect(page.getByText(/Cette lettre ne résilie que l'assurance de base chez Helsana/)).toBeVisible();
  await expect(page.getByText(/^Hospitalisation demi-privée, /)).toBeVisible();
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

  // Envoi par Pingen (doublure locale, configurée seulement pour le serveur lancé par les tests) :
  // transmission, refus constaté au suivi, puis reprise de la lettre pour l'envoyer soi-même.
  if (!process.env.E2E_BASE_URL) {
    // Pingen est facturé à l'exploitant : l'administrateur l'ouvre foyer par foyer.
    await expect(page.getByRole("button", { name: "Envoyer en recommandé via Pingen" })).toHaveCount(0);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Autoriser l'envoi Pingen" }).click();
    await expect(page.getByText("Envoi Pingen activé pour ce foyer.")).toBeVisible();
    await page.goto("/bilan/2027/lettres");
    await page.getByRole("button", { name: "Envoyer en recommandé via Pingen" }).click();
    await expect(page.getByText(/Une signature imprimée n'est pas une signature manuscrite/)).toBeVisible();
    await page.getByRole("button", { name: "Envoyer (test)" }).click();
    await expect(page.getByText(/En préparation chez Pingen/)).toBeVisible();
    await expect(page.getByText(/Confiée à Pingen le/)).toBeVisible();
    // Tout est parti : le bilan se clôt tout seul…
    await expect(page.getByText("Tout est envoyé", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Actualiser le suivi" }).click();
    await expect(page.getByText("Pingen n'a pas envoyé cette lettre")).toBeVisible();
    // … et se rouvre quand Pingen refuse la lettre.
    await expect(page.getByText("Tout est envoyé", { exact: true })).toHaveCount(0);
    await expect(page.getByText("À reprendre")).toBeVisible();
    await shot(page, "09a-pingen-refus");
    await page.getByRole("button", { name: "Reprendre la lettre" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reprendre la lettre" }).click();
    await expect(page.getByRole("button", { name: "Envoyer en recommandé via Pingen" })).toBeVisible();
    await shot(page, "09b-pingen-option");
  }

  await page.getByLabel("N° de suivi").fill("98.00.123456.12345678");
  await page.getByRole("button", { name: "Marquer comme envoyée" }).click();
  await expect(page.getByText("Suivi : 98.00.123456.12345678")).toBeVisible();
  // Dernier courrier envoyé : le bilan se clôt tout seul, sans étape de confirmations.
  await expect(page.getByText("Tout est envoyé", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reçue", exact: true })).toHaveCount(0);
  await shot(page, "09-demarches");

  // Clôture automatique et historique
  await page.goto("/bilan/2027");
  await expect(page.getByText("Clôturé · contrats 2027 créés.")).toBeVisible();
  await expect(page.getByText("C'est terminé")).toBeVisible();
  await page.getByRole("link", { name: "Historique" }).click();
  await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("2027");
  await expect(page.getByText("Économisé grâce aux bilans")).toBeVisible();
  await expect(page.getByText("Parcours de chaque personne")).toBeVisible();
  await shot(page, "10-historique");
  await expectAccessible(page);
  await page.goto("/");
  await expect(page.getByText(/C'est fait, CHF .* économisés\./)).toBeVisible();
  await expect(page.getByRole("link", { name: /Voir le bilan/ })).toBeVisible();
  await shot(page, "11-accueil");
  await expectAccessible(page);
});

test.describe("sur ordinateur", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("navigation latérale, toutes les pages, et retour en arrière sur un bilan clôturé", async ({ page }) => {
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
    await expect(page.getByRole("link", { name: "Importer une police" })).toHaveCount(0);
    await page.getByRole("link", { name: /Alex Test/ }).click();
    await shot(page, "d05-personne");
    // Ajouter un contrat : importer la police ou saisir à la main.
    await page.getByRole("button", { name: "Ajouter un contrat LAMal" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, "d06-dialogue");
    await page.getByRole("dialog").getByRole("button", { name: /Saisir à la main/ }).click();
    await expect(page.getByRole("dialog").getByLabel("Caisse-maladie")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Ajouter un contrat LAMal" }).click();
    await page.getByRole("dialog").getByRole("link", { name: /Importer le PDF de la police/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Importer une police" })).toBeVisible();
    await shot(page, "d04b-import-police");

    // Bilan clôturé : on peut le rouvrir…
    await nav.getByRole("link", { name: /Bilan/ }).click();
    await expect(page.getByText("Clôturé · contrats 2027 créés.")).toBeVisible();
    await shot(page, "d07-bilan-cloture");
    await page.getByRole("button", { name: "Modifier mes choix" }).click();
    await page.waitForTimeout(300);
    await shot(page, "d08-confirmation");
    await page.getByRole("dialog").getByRole("button", { name: "Modifier mes choix" }).click();
    await expect(page.getByText("C'est terminé")).toHaveCount(0);
    await expect(page.getByText("Je change de caisse")).toBeVisible();
    await page.getByRole("link", { name: "Revoir" }).click();
    await expect(page.getByText("Sans rien faire en 2027")).toBeVisible();
    await shot(page, "d09-comparateur");
    await page.goto("/bilan/2027");

    // … ou recommencer à zéro.
    await page.getByRole("button", { name: "Recommencer à zéro" }).click();
    await expect(page.getByRole("dialog")).toContainText("Les courriers déjà postés ne sont pas annulés.");
    await page.getByRole("dialog").getByRole("button", { name: "Recommencer", exact: true }).click();
    // Les primes sont publiées : une analyse vierge s'ouvre, sans aucun choix.
    await expect(page.getByRole("link", { name: "Régler mes préférences" }).first()).toBeVisible();
    await expect(page.getByText("Je change de caisse")).toHaveCount(0);
    await shot(page, "d10-bilan-supprime");
  });
});

test("recommencer à zéro, puis une personne seule depuis sa police PDF", async ({ page }) => {
  await login(page);

  // Réglages › Mes données : supprimer le foyer (la session vient d'être ouverte : identité confirmée).
  await page.goto("/donnees");
  await page.getByRole("link", { name: /Mes données/ }).click();
  await expect(page.getByText("Identité confirmée")).toBeVisible();
  await page.getByRole("button", { name: "Supprimer le foyer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer le foyer" }).click();
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
  await expectAccessible(page);
});
