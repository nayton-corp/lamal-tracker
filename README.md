# LAMal Tracker

Application web mobile (PWA) pour suivre les primes d'assurance-maladie de base (LAMal) du foyer et faire, chaque automne, le tour des offres sans rien oublier.

- **Primes officielles OFSP** importées depuis opendata.swiss (automatiquement sur le Pi, ou par envoi du fichier), vérifiées avant usage.
- **Hausse de chaque contrat** dès la publication des primes, avec le produit équivalent de l'année suivante.
- **Comparateur par personne** : région, franchise, accident, modèle (standard, médecin de famille, HMO, Telmed, pharmacie), coût total estimé selon tes frais de santé, simulateur de franchise.
- **Lettre de résiliation PDF** prête à signer, une par caisse quittée, avec rappels avant le 30 novembre.
- **Garde-fou LCA** : impossible de générer une lettre sans avoir confirmé que les complémentaires ne sont pas résiliées.
- **Prime nette** (redistribution CO2/COV déduite), **plusieurs personnes**, **historique sur plusieurs années**.
- Notifications push, consultation hors ligne, sauvegarde quotidienne de la base.

Toutes les données restent sur ton Raspberry Pi (base SQLite dans `./data`).

---

## Le rituel d'automne

| Quand                    | Quoi                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fin septembre            | L'OFSP publie les primes de l'année suivante. Le Pi les télécharge (notification « Primes à valider »). Ouvre le rapport dans **Réglages → Primes OFSP** et active-les.      |
| Dès l'activation         | **Accueil → Ouvrir le rituel** : hausse par personne, meilleures offres, renouvellement à confirmer si le produit a changé de nom.                                           |
| Octobre – novembre       | Pour chaque personne : **Je reste** ou **Choisir** une offre. Un changement de caisse passe par le **garde-fou LCA**, puis **Lettres** : génère, imprime, signe.             |
| Avant la date conseillée | Demande l'affiliation à la nouvelle caisse, puis envoie la lettre **en recommandé** (date conseillée affichée, réception au plus tard le dernier jour ouvrable de novembre). |
| Décembre                 | Note la confirmation de l'ancienne caisse et la nouvelle police (rappels automatiques sinon).                                                                                |
| Janvier                  | **Clôturer le rituel** : les contrats de l'année sont créés et l'historique est figé.                                                                                        |

La première fois : **Foyer** (adresse, canton, région de primes), une fiche par personne, puis le contrat LAMal de l'année en cours (la police indique la caisse, le modèle, la franchise et la prime). Ajoute aussi les **complémentaires (LCA)** : elles déclenchent l'avertissement au moment de changer de caisse.

Les noms et adresses de résiliation des caisses sont pré-remplis à titre indicatif : vérifie-les dans **Réglages → Assureurs** avant d'envoyer une lettre.

---

## Installation sur le Raspberry Pi

Prérequis : Raspberry Pi 4 ou 5 en 64 bits (Raspberry Pi OS Bookworm) avec Docker.

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se reconnecter
```

### 1. Lancer l'application

```bash
mkdir -p ~/lamal-tracker && cd ~/lamal-tracker
curl -fsSLO https://raw.githubusercontent.com/NaYthanB/lamal-tracker/main/docker-compose.yml
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d
```

L'application répond sur `http://<ip-du-pi>:3000`. L'image `ghcr.io/naythanb/lamal-tracker` est construite par GitHub Actions pour arm64 et amd64.

> Si le téléchargement de l'image est refusé (paquet privé), soit rends le paquet public dans GitHub → Packages → lamal-tracker → Package settings, soit construis sur le Pi : clone le dépôt, décommente `build: .` dans `docker-compose.yml` et lance `docker compose up -d --build` (compter une dizaine de minutes sur un Pi 4).

Mise à jour : `docker compose pull && docker compose up -d`. Les migrations de base sont appliquées automatiquement au démarrage.

### 2. HTTPS avec Tailscale (recommandé)

L'installation sur l'écran d'accueil, le mode hors ligne et les notifications push exigent HTTPS. Le plus simple : [Tailscale](https://tailscale.com) sur le Pi et sur le téléphone.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale serve --bg 3000
```

L'app est alors accessible en `https://<nom-du-pi>.<ton-tailnet>.ts.net` depuis tes appareils connectés à Tailscale, y compris hors de chez toi, sans ouvrir de port sur la box. (Active d'abord « HTTPS Certificates » dans la console Tailscale → DNS.)

Sur iPhone : ouvre l'adresse dans Safari → Partager → **Sur l'écran d'accueil**, puis ouvre l'app depuis l'icône et active les notifications dans **Réglages**. Sur Android : Chrome propose l'installation.

### 3. Options

Dans `docker-compose.yml` :

| Variable        | Rôle                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `APP_PASSWORD`  | Active une authentification HTTP (utilisateur `lamal` ou `APP_USER`). Inutile derrière Tailscale seul. |
| `VAPID_SUBJECT` | Contact transmis aux services push (`mailto:…`). Les clés push sont générées automatiquement.          |
| `TZ`            | Fuseau horaire des rappels (par défaut `Europe/Zurich`).                                               |

---

## Sauvegardes

- Une copie cohérente de la base est faite chaque jour dans `data/backups/` (14 jours conservés).
- **Réglages → Sauvegardes** permet de télécharger une copie à tout moment.
- Pour une copie hors du Pi : sauvegarde le dossier `data/` (ex. `rsync` vers un NAS).

Restauration :

```bash
docker compose down
cp data/backups/lamal-AAAA-MM-JJ.sqlite data/lamal.sqlite
rm -f data/lamal.sqlite-wal data/lamal.sqlite-shm
docker compose up -d
```

## Primes OFSP

Le Pi cherche chaque jour, de mi-septembre à décembre, le fichier des primes sur opendata.swiss (jeu « Prämien / Primes de l'assurance obligatoire des soins »). Chaque import est contrôlé (colonnes reconnues, cantons, assureurs sans modèle standard, primes hors bornes, variations de plus de 30 %) et reste **en attente** jusqu'à ton activation.

Si la recherche automatique ne trouve rien (le jeu de données change parfois d'adresse), télécharge le fichier à la main sur [opendata.swiss](https://opendata.swiss/fr/dataset?q=primes+assurance-maladie) et envoie-le dans **Réglages → Primes OFSP**, ou indique son URL directe dans « Sources avancées ». Les formats CSV et ZIP, en-têtes allemands, français ou italiens, encodages UTF-8 ou Windows sont acceptés.

---

## Développement

```bash
pnpm install
pnpm seed:demo --today 2026-10-05   # base de démonstration (données synthétiques) dans ./data
LAMAL_TODAY=2026-10-05 pnpm dev      # date figée pour tester le rituel
```

| Commande                                           | Rôle                                               |
| -------------------------------------------------- | -------------------------------------------------- |
| `pnpm test`                                        | Tests unitaires et d'intégration (Vitest)          |
| `pnpm build && pnpm test:e2e`                      | Parcours complet sur téléphone (Playwright)        |
| `pnpm lint` · `pnpm typecheck`                     | ESLint et TypeScript strict                        |
| `pnpm lint:arch`                                   | Règles d'architecture (dependency-cruiser)         |
| `pnpm ingest fichier.zip --year 2027 [--activate]` | Import d'un fichier de primes en ligne de commande |
| `pnpm db:generate`                                 | Nouvelle migration après modification du schéma    |

Architecture (Clean Architecture) :

```
src/domain           règles métier pures : montants en centimes, échéances, franchises, comparaison, lettre
src/application      cas d'usage : import des primes, rituel, lettres, historique, tâches planifiées
src/infrastructure   SQLite (Drizzle), lecteur OFSP, PDF (react-pdf), push, planificateur
src/app              pages et actions serveur Next.js (App Router)
src/ui               composants (aucun accès direct à la base)
```

Les montants sont toujours des entiers en centimes, les dates des chaînes `AAAA-MM-JJ` en heure suisse. Des déclencheurs SQLite empêchent en base de générer une lettre sans changement de caisse validé par le garde-fou LCA.

> Les calculs sont indicatifs. Vérifie les conditions de ta police et les informations officielles sur [priminfo.admin.ch](https://www.priminfo.admin.ch) avant de résilier.
