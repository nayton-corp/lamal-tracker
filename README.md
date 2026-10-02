# Primes LAMal — suivi et comparateur annuel

PWA personnelle, mobile d'abord, auto-hébergée sur un Raspberry Pi. Chaque automne :

1. **les primes officielles de l'OFSP sont importées automatiquement** dès leur publication (fin septembre) ;
2. l'app calcule **la hausse de chaque membre du foyer** pour l'année suivante, sans rien changer ;
3. le **comparateur** (offres détaillées, comparaison côte à côte de 2 à 4 offres, coût sans frais / attendu / année chargée) classe les caisses de votre région selon le **coût total attendu** (prime nette de CO2 + franchise + quote-part), avec un simulateur de franchise, le portrait de chaque caisse (réserves, frais administratifs, taille, évolution de ses primes face au marché) et l'explication de chaque modèle ;
4. un **garde-fou LCA** (confirmation par appui long) empêche de résilier une complémentaire par erreur ;
5. la page **Démarches** guide pas à pas : demande d'affiliation à la nouvelle caisse (PDF et e-mail prérempli, complémentaires souhaitées comprises), résiliation chez l'ancienne, puis confirmations ;
6. les **lettres de résiliation PDF** (format enveloppe à fenêtre suisse) sont générées en un geste, avec suivi des envois recommandés et rappels avant le 30 novembre ;
7. l'**historique pluriannuel** garde les primes réellement payées, les économies des rituels et la position du foyer dans le marché ;
8. le **PDF de la police** peut être importé (*Foyer › Importer une police*) : caisse, personnes, tarif officiel, franchise, prime et complémentaires sont repris, lecture locale sans service externe.

> Outil d'aide à la décision, pas un conseil en assurance. Vérifiez toujours les conditions des modèles (liste de médecins, Telmed…) auprès de la caisse.

## Déploiement sur le Raspberry Pi

Prérequis : Raspberry Pi 4 ou 5 avec un **OS 64 bits** (Raspberry Pi OS 64-bit ou Ubuntu), 2 Go de RAM minimum, et Docker.

### 1. Installer Docker (une fois)

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se déconnecter / reconnecter
```

### 2. Récupérer l'image

L'image `linux/arm64` est construite automatiquement par GitHub Actions à chaque mise à jour de `main` et publiée sur `ghcr.io/nayton-corp/lamal-tracker`. Le dépôt étant privé, l'image l'est aussi : il faut se connecter une fois avec un jeton GitHub.

1. Sur GitHub : *Settings › Developer settings › Personal access tokens › Tokens (classic)*, créer un jeton avec la seule permission **`read:packages`** (votre compte doit avoir accès au dépôt `nayton-corp/lamal-tracker` ; si l'organisation impose le SSO, autoriser le jeton pour elle).
2. Sur le Pi :

```sh
echo "<le-jeton>" | docker login ghcr.io -u NaYthanB --password-stdin
```

### 3. Lancer

```sh
mkdir -p ~/lamal-tracker && cd ~/lamal-tracker
# copier docker-compose.yml de ce dépôt dans ce dossier, puis :
docker compose up -d
```

L'app répond sur `http://<ip-du-pi>:3000`. Les données vivent dans `~/lamal-tracker/data` (un seul fichier SQLite).

Variables utiles (dans `docker-compose.yml`) :

| Variable | Rôle |
|---|---|
| `APP_PASSWORD` | Mot de passe d'accès (recommandé dès que le Pi est joignable hors de chez vous). |
| `IMPORT_CANTONS` | Ex. `VD` : n'importe que votre canton (≈ 3 Mo par an au lieu de ≈ 60 Mo). |
| `VAPID_SUBJECT` | `mailto:` de contact pour les notifications push. |
| `OFSP_AUTO_CHECK=false` | Désactive le contrôle automatique des nouvelles primes. |
| `OFSP_PREMIUMS_URL` | Force l'URL du fichier de primes si l'OFSP la change. |

### 4. HTTPS pour l'installation sur le téléphone et les notifications

Un navigateur n'autorise l'installation d'une PWA, le mode hors ligne et les notifications que sur **HTTPS**. Le plus simple : [Tailscale](https://tailscale.com) (gratuit), qui donne aussi l'accès depuis l'extérieur sans ouvrir de port.

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale serve --bg 3000
```

L'app est alors disponible sur `https://<nom-du-pi>.<votre-tailnet>.ts.net` depuis tout appareil connecté à Tailscale. Sur iPhone : Safari › Partager › *Sur l'écran d'accueil*, puis *Réglages › Rappels › Activer*.

Sans HTTPS, l'app fonctionne normalement dans le navigateur ; seules l'installation, le hors-ligne et les notifications sont indisponibles.

### Mise à jour, sauvegarde

```sh
cd ~/lamal-tracker && docker compose pull && docker compose up -d
```

- **Sauvegarde** : *Réglages › Sauvegarde* télécharge une copie cohérente de la base. Ou, sur le Pi : `cp data/lamal.db* /un/autre/disque/` (app arrêtée), ou `sqlite3 data/lamal.db ".backup '/chemin/sauvegarde.db'"`.
- **Restauration** : arrêter le conteneur, remettre le fichier `lamal.db` dans `data/`, relancer.
- Les migrations du schéma s'appliquent seules au démarrage.

### Construire l'image sur le Pi (alternative)

Cloner le dépôt sur le Pi, décommenter `build: .` dans `docker-compose.yml`, puis `docker compose up -d --build` (compter une dizaine de minutes sur un Pi 4).

## Le rituel d'automne, pas à pas

| Quand | Quoi |
|---|---|
| Une fois | *Foyer* : adresse, canton, **région de primes** (sur la police), membres, puis le contrat LAMal de l'année en cours de chacun, saisi ou importé depuis le PDF de la police. Ajouter les **complémentaires LCA** (garantie choisie dans une liste, assureur prérempli d'après la caisse LAMal). Les adresses des caisses viennent de l'annuaire officiel ; ne les modifier que si la police en indique une autre. |
| Fin septembre | L'OFSP publie les primes ; l'app les importe (contrôle quotidien du 15 septembre au 30 novembre) et envoie une notification. Import manuel possible dans *Réglages*. |
| Octobre | *Rituel* : lancer l'analyse. Pour chaque personne : hausse, tarif de renouvellement (à confirmer si la caisse a renommé son tarif), comparateur, simulateur de franchise, choix. |
| Avant ~23 novembre | Passer le **contrôle LCA**, puis *Démarches* : envoyer la **demande d'affiliation** à la nouvelle caisse, imprimer, signer et envoyer la **résiliation en recommandé** (réception au plus tard le 30 novembre), saisir le n° de suivi, cocher les confirmations reçues. |
| Décembre / janvier | Marquer les confirmations reçues, puis **clôturer** : les contrats de la nouvelle année sont créés et l'historique mis à jour. Ajuster la prime facturée si elle diffère. Un rituel, même clôturé, peut être **rouvert** (les choix sont gardés, les contrats créés retirés) ou **supprimé** (retour à l'état d'avant). |

## Données OFSP

- Source : [opendata.swiss — Krankenversicherungsprämien](https://opendata.swiss/de/dataset/health-insurance-premiums) (fichier `Prämien_CH.xlsx`). Depuis les primes 2027, le fichier n'est plus sur priminfo.admin.ch.
- L'OFSP a changé **tous les codes** en 2027 (régions `PR_REG_1`, classes d'âge `AKA_03_ERW`, franchises `FRA_01_E_0300`, types de tarif `BASE/PRAXIS/FLEX/TEL_DIG/PHARM`). Le parseur lit les deux générations et les ramène à une seule forme ; une ligne illisible est rejetée et comptée, jamais devinée.
- **Années précédentes** : *Réglages › Récupérer les primes des années passées* télécharge les archives annuelles de l'OFSP (`Archiv_Praemien_AAAA.zip`, ancien format de codes, années **2015 et suivantes** ; avant 2015, l'OFSP utilisait un schéma où la couverture accident n'est pas identifiable avec certitude) pour les repères de marché de l'historique et le pré-remplissage des anciens contrats. Une archive plus ancienne (par ex. depuis [l'archive Priminfo](https://www.priminfo.admin.ch/de/downloads/archiv)) peut être importée à la main (.zip, .xlsx ou .csv).
- Vos **propres contrats** des années passées (2010 et suivantes) se saisissent dans *Foyer* : l'historique se construit à partir d'eux.
- Chaque import est un **jeu immuable** identifié par son empreinte SHA-256, validé (années, cantons, bornes de primes, variation par rapport à l'année précédente) avant d'être activé.
- Le workflow *Surveillance du format OFSP* importe le vrai fichier chaque jour en septembre-octobre : s'il échoue, GitHub vous prévient avant le rituel.
- L'Open Data des primes ne contient **pas** les listes de médecins des modèles alternatifs ni les tarifs des complémentaires LCA (aucune source publique : les comparateurs les obtiennent par accord avec les caisses). Les complémentaires se demandent donc aux caisses, via la demande d'offre.

## Données officielles de référence

Livrées avec l'image et revérifiées chaque semaine par le Raspberry Pi (*Réglages › Données officielles › Vérifier maintenant*) ; un workflow mensuel propose aussi leur mise à jour dans le dépôt (`scripts/build-reference.ts`).

- **Annuaire des assureurs reconnus** (OFSP, xlsx semestriel) : raison sociale française, adresse postale, téléphone, e-mail, site, groupe. Sert d'adresse de résiliation et de destinataire des demandes d'offre. Une adresse modifiée dans l'app n'est jamais écrasée.
- **Données de surveillance** (OFSP, une feuille par année) : assurés, primes, frais administratifs et réserves par assuré, pour le portrait des caisses.
- **Redistribution CO2** (OFEV) : montant annuel par personne, repris automatiquement ; un montant saisi à la main reste prioritaire jusqu'au retour au montant officiel.

## Développement

```sh
pnpm install
pnpm fixtures      # fichiers de primes synthétiques (formats 2026 et 2027)
pnpm dev           # http://localhost:3000
pnpm test          # tests unitaires et d'intégration (Vitest)
pnpm lint && pnpm typecheck
pnpm build && pnpm e2e   # parcours complet sur mobile (Playwright)
pnpm cli import tests/fixtures/generated/primes-2027.xlsx
pnpm cli download  # importe le fichier OFSP réel
pnpm cli download-archives  # importe les archives des années précédentes
```

Architecture : voir [`docs/architecture.md`](docs/architecture.md).
