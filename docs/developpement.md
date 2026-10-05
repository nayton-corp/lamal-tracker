# Développement

Ce guide permet de lancer l'app en local, de la tester et d'y ajouter une fonctionnalité. Les
couches du code et le trajet d'une requête sont décrits dans [architecture.md](architecture.md) ;
les notions métier dans [concepts.md](concepts.md) et le vocabulaire dans
[glossaire.md](glossaire.md).

## Prérequis

| Outil | Version | Où c'est fixé |
|---|---|---|
| Node.js | 22 (au moins) | `engines` de `package.json`, image `node:22-bookworm-slim` du `Dockerfile`, CI |
| pnpm | 10.28.0 | `packageManager` de `package.json` (`corepack enable` l'installe) |
| Chromium | celui de Playwright | Seulement pour les tests e2e et `scripts/make-icons.ts` |

`better-sqlite3` est un module natif : `pnpm install` le compile si aucun binaire précompilé ne
correspond à la machine.

## Premier lancement

```sh
corepack enable          # une fois, pour avoir la bonne version de pnpm
pnpm install
pnpm fixtures            # fichiers de primes et police PDF synthétiques
pnpm dev                 # http://localhost:3000
```

- **La base** est créée au premier lancement dans `data/lamal.db` (variable `DATABASE_PATH`),
  migrations comprises. Le dossier `data/` est ignoré par git. Pour repartir de zéro : arrêter
  le serveur et supprimer `data/`.
- **Le premier compte** : sans aucun compte, toutes les pages mènent à `/login/creer`, qui crée
  le compte administrateur. En local (HTTP), `SETUP_TOKEN` est facultatif ; il devient
  obligatoire dès qu'`APP_URL` est en `https://`. L'administrateur doit ensuite ajouter une
  passkey ou le double facteur, sauf avec `ADMIN_REQUIRE_2FA=false`.
- **Les fixtures** (`pnpm fixtures`, script `scripts/make-fixtures.ts`) écrivent dans
  `tests/fixtures/generated/` : `primes-2026.xlsx` (ancien format de codes), `primes-2027.xlsx` et
  `primes-2027.csv` (nouveau format), `police-2026.pdf`. Elles servent aux tests et à remplir une
  base locale sans Internet :

  ```sh
  pnpm cli import tests/fixtures/generated/primes-2026.xlsx
  pnpm cli import tests/fixtures/generated/primes-2027.xlsx
  ```

### Import automatique au premier démarrage

Le planificateur (`src/instrumentation.ts`) tourne aussi avec `pnpm dev`. Son premier passage,
30 secondes après le démarrage, appelle `ensureBaseDatasets()` (`src/server/watch.ts`) : si la base
n'a **aucun** jeu de primes, il télécharge le fichier réel de l'OFSP (environ 60 Mo, moins avec
`IMPORT_CANTONS`), puis tente une fois par jour d'importer l'archive de l'année en cours si elle
manque. Pour travailler hors ligne ou avec les seules fixtures, poser `OFSP_AUTO_CHECK=false`
(coupe aussi le contrôle des nouvelles primes) ou `DISABLE_SCHEDULER=true` (coupe toutes les
tâches de fond).

### Variables utiles en développement

À placer dans `.env.local` (lu par Next.js, ignoré par git). La référence complète est
[exploitation/configuration.md](exploitation/configuration.md).

| Variable | Effet en local |
|---|---|
| `FAKE_TODAY=2026-10-05` | Fige la date du jour (`today()` de `src/server/context.ts`) : pratique pour être en pleine saison du rituel. Les horodatages (`nowIso()`) restent réels. |
| `MAIL_DIR=data/mail` avec `APP_URL=http://localhost:3000` | Chaque courriel est écrit dans un fichier JSON au lieu d'être envoyé : on y lit les liens de confirmation et de réinitialisation. Sans `APP_URL`, aucun courriel n'est produit. |
| `DISABLE_SCHEDULER=true` | Aucune tâche de fond (import, rappels, Pingen, inactivité). |
| `OFSP_AUTO_CHECK=false` | Pas de téléchargement OFSP automatique. |
| `HIBP_DISABLED=true` | Les mots de passe ne sont pas vérifiés auprès de Have I Been Pwned (pas d'appel réseau). |
| `ADMIN_REQUIRE_2FA=false` | L'administrateur local n'a pas besoin de second facteur. |
| `DATABASE_PATH` | Autre fichier de base (une base par essai). |

## Tests

| Où | Quoi | Outil |
|---|---|---|
| `src/domain/**/*.test.ts` | Tests du domaine, à côté du fichier testé (`cost.test.ts`, `renewal.test.ts`…) | Vitest |
| `tests/unit/*.test.ts` | Tests d'intégration : cas d'usage sur une vraie base SQLite en mémoire (`openDb(":memory:")`), migrations, import, cloisonnement (`isolation.test.ts`) | Vitest |
| `tests/e2e/*.spec.ts` | Parcours complets dans un navigateur mobile (Pixel 7, `fr-CH`) : rituel, partage du foyer, présentation | Playwright |
| `tests/fixtures/` | Générateur de fichiers synthétiques (`generate.ts`, `policy-pdf.ts`), fichiers officiels de référence (`official/`) | |
| `tests/accounts.ts` | `testAccount()`, `testHousehold()` : un `Scope` prêt à l'emploi pour les tests | |

```sh
pnpm test            # tous les tests Vitest (génère les fixtures si besoin)
pnpm test:watch      # en continu
pnpm vitest run src/domain/cost.test.ts   # un seul fichier
```

### Tests e2e

```sh
pnpm exec playwright install chromium   # une fois (la CI ajoute --with-deps)
pnpm build                              # l'e2e teste le build « standalone », pas pnpm dev
pnpm e2e
```

`playwright.config.ts` lance deux serveurs :

- une **doublure de l'API Pingen** (`tests/pingen-mock.ts`, port 3101) : l'envoi en recommandé
  est testé sans rien poster ;
- l'app construite (`.next/standalone/server.js`, port 3100), avec une base neuve dans `.e2e/`,
  `FAKE_TODAY=2026-10-05`, `DISABLE_SCHEDULER=true`, les courriels dans `.e2e/mail`,
  `HIBP_DISABLED=true` et un `SETUP_TOKEN` de test.

Avec un Chromium déjà installé ailleurs, `CHROMIUM_PATH=/chemin/vers/chromium` évite le
téléchargement. `E2E_BASE_URL=http://…` lance les tests contre un serveur déjà démarré (le
conteneur Docker par exemple) au lieu du build local.

## Ligne de commande

`pnpm cli <commande>` (`src/cli/main.ts`) travaille sur la base `DATABASE_PATH` (défaut
`./data/lamal.db`). Code de sortie 1 si un fichier est refusé.

| Commande | Effet |
|---|---|
| `import <fichier>` | Importe un fichier de primes (`.xlsx`, `.csv` ou archive `.zip`) et affiche le rapport |
| `download` | Télécharge et importe le fichier OFSP courant |
| `url` | Affiche l'URL OFSP résolue |
| `archives` | Liste les archives annuelles disponibles |
| `download-archives` | Importe les archives absentes de la base |
| `inspect <fichier>` | Diagnostic d'un fichier : feuilles, colonnes, premières lignes |

## Scripts

| Script | Rôle | Lancement |
|---|---|---|
| `scripts/make-fixtures.ts` | Génère les fixtures de test | `pnpm fixtures` |
| `scripts/build-reference.ts` | Régénère les référentiels embarqués (`src/infrastructure/reference/data/` : annuaire des caisses, surveillance, CO2) | `pnpm exec tsx --tsconfig tsconfig.json scripts/build-reference.ts` (workflow mensuel) |
| `scripts/build-postal-regions.ts` | Régénère `src/infrastructure/regions/postal-regions.json` (code postal → commune → région) depuis l'OFSP et swisstopo | `pnpm exec tsx scripts/build-postal-regions.ts` (workflow annuel) |
| `scripts/sample-letter.tsx` | Rend une lettre d'exemple en PDF pour contrôler la mise en page | `pnpm exec tsx --tsconfig tsconfig.json scripts/sample-letter.tsx lettre.pdf` |
| `scripts/make-icons.ts` | Génère les icônes PNG de la PWA depuis les SVG de `public/icons/` (avec Chromium) | `pnpm exec tsx scripts/make-icons.ts` |
| `scripts/prepare-standalone.sh` | Copie `public/`, les fichiers statiques et `drizzle/` dans `.next/standalone/` | Appelé par `pnpm build` |
| `scripts/entrypoint.sh` | Point d'entrée du conteneur : vérifie que le dossier des données est accessible en écriture | Image Docker |

## Conventions de code

### Langues et noms

- **Identifiants en anglais** (`review`, `household`, `franchiseChf`), **commentaires et
  interface en français**. Les routes sont en français (`/rituel`, `/foyer`, `/donnees`).
- **Énumérations** en MAJUSCULES anglaises (`SWITCH`, `ECONOMY`) ; elles sont stockées telles
  quelles en base (voir [modele-de-donnees.md](modele-de-donnees.md#valeurs-enregistrées-à-ne-pas-renommer)).
- **Unités en suffixe** : `Rp`/`_rp` centimes entiers (type `Rappen`), `Chf`/`_chf` francs
  entiers, `Bp` points de base, `Permille` pour mille. Jamais de nombre à virgule pour de
  l'argent : conversions par `src/domain/money.ts` (`parseChf`, `formatChf`).
- **Dates** : `IsoDate` (`AAAA-MM-JJ`) pour une date civile, chaîne ISO UTC pour un instant.
- **Actions serveur** : fonctions `*Action` dans `src/app/actions/*.ts` (ou `actions.ts` à côté
  de la page).
- **Paramètres légaux** (franchises, quote-part, CO2) : toujours lus par année
  (`parametersFor()`), jamais écrits en dur dans un calcul.
- **Interface** : mobile d'abord, composants de `src/ui/`. La couleur ambre (jetons `--lca*` de
  `src/app/globals.css`, ton `lca` des alertes) est réservée aux alertes LCA.

### Ce que vérifie ESLint, et ce qui n'est que convention

Les règles d'import par couche sont décrites dans [architecture.md](architecture.md#3-les-couches-et-ce-queslint-impose).
Deux règles restent des conventions, vérifiées en revue : le domaine ne lit pas l'horloge (la
date lui est passée en paramètre), et chaque cas d'usage reçoit un `Scope` et passe par
`owned*`/`find*` (le test d'isolation le vérifie).

## Ajouter une fonctionnalité de bout en bout

Exemple réel à suivre : les avis (`feedback`), du schéma à la page `/avis`.

1. **Schéma** (si besoin). Ajouter la table ou la colonne dans
   `src/infrastructure/db/schema.ts`, rattachée à un foyer (`household_id` ou via `person` /
   `review`) avec `onDelete: "cascade"`. Puis `pnpm db:generate` et relire le SQL produit
   (détails dans [modele-de-donnees.md](modele-de-donnees.md#modifier-le-schéma)).
2. **Domaine** (si la règle est un calcul). Une fonction pure dans `src/domain/`, sans base ni
   horloge, et son test à côté (`src/domain/<fichier>.test.ts`).
3. **Cas d'usage** dans `src/application/`. Signature type :
   `maFonction(db: Db, scope: Scope, …entrées, nowIso: string)`.
   - Valider les entrées avec Zod ; une erreur prévue est une `UserError` (message affiché tel
     quel).
   - Tout objet désigné par un identifiant passe par `owned*` (refuse) ou `find*` (renvoie
     `null`) de `src/application/scope.ts` : un objet d'un autre foyer est « introuvable ».
     Ajouter un helper `owned*` si l'objet est nouveau.
   - Le foyer vient de `scope.householdId` (ou `householdIdOf(scope)`), jamais d'un paramètre.
   - `requireOwner(scope)` pour ce qui est réservé au propriétaire, `requireAdmin(scope)` pour le
     référentiel partagé.
4. **Action serveur** dans `src/app/actions/<sujet>.ts` (`"use server"`) :

   ```ts
   export async function saveThingAction(_: ActionState, form: FormData): Promise<ActionState> {
     try {
       const scope = await requireScope();          // ou requireAdminScope()
       saveThing(db(), scope, { name: form.get("name") }, nowIso());
     } catch (e) {
       return toActionError(e);                     // UserError et ZodError → message
     }
     revalidatePath("/chemin");
     return { ok: "Enregistré." };
   }
   ```

   `requireScope()` vient de `src/server/auth.ts`, `ActionState` et `toActionError()` de
   `src/server/action.ts`, `db()` et `nowIso()` de `src/server/context.ts`. Une erreur inconnue
   n'est pas attrapée : elle remonte comme une vraie panne.
5. **Page** dans `src/app/<route>/page.tsx` : commencer par `const scope = await pageScope();`
   (`accountPageScope()` pour les pages du compte), lire les données par les fonctions de
   `src/application`, et brancher le formulaire avec `ActionForm` de `src/ui/action-form.tsx`.
6. **Test d'isolation**. Ajouter le nouveau cas d'usage à `tests/unit/isolation.test.ts` : appelé
   par le foyer A avec les identifiants du foyer B, il doit être refusé sans rien modifier.
7. **Tests** : intégration dans `tests/unit/` si le cas d'usage a de la logique ; e2e dans
   `tests/e2e/` si le parcours utilisateur change.
8. **Documentation** : mettre à jour le document qui porte le sujet (voir [README](README.md)) et
   le [glossaire](glossaire.md) pour un nouveau terme.

## Avant de pousser

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Intégration continue

| Workflow | Déclenchement | Rôle |
|---|---|---|
| `ci.yml` | Push sur `main`, pull request, manuel | Lint, types, tests, build, e2e ; scan ZAP passif ; `pnpm audit` et TruffleHog ; image construite, scannée par Trivy et lancée en lecture seule ; import du vrai fichier OFSP et des archives |
| `docker.yml` | CI réussie sur `main`, tag `v*` | Construit et publie l'image `linux/amd64` et `linux/arm64` sur ghcr.io |
| `ofsp-watch.yml` | Chaque jour en septembre-octobre, chaque lundi sinon | Importe le vrai fichier OFSP (`pnpm cli download`) : un échec prévient avant le rituel |
| `reference-data.yml` | Le 3 de chaque mois | Lance `scripts/build-reference.ts` et propose une pull request si les référentiels ont changé |
| `postal-regions.yml` | Le 20 septembre | Lance `scripts/build-postal-regions.ts` et propose une pull request si la table a changé |
