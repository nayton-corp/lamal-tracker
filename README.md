# Primes LAMal — suivi et comparateur annuel

PWA mobile d'abord, auto-hébergée (Raspberry Pi ou petit serveur), **multi-foyers** : chaque foyer a ses comptes (courriel et mot de passe, passkeys, double facteur), l'inscription se fait **sur invitation**, et un conjoint peut rejoindre le foyer avec son propre compte. À la première connexion, un **accueil guidé** demande pour qui gérer l'assurance (une personne seule ou un foyer), puis propose de **partir du PDF de la police** : personnes, adresse et contrats en sont lus (sur le Pi, rien ne sort), il ne reste qu'à vérifier. Sinon, une **saisie guidée** en quelques questions. Chaque automne :

1. **les primes officielles de l'OFSP sont importées automatiquement** dès leur publication (fin septembre) ;
2. pendant la fenêtre de changement (publication des primes → 30 novembre), l'accueil montre la **reconduction tacite** : ce que le foyer paiera l'an prochain sans rien faire, personne par personne, l'écart avec cette année et le compte à rebours ;
3. on choisit une **stratégie** (Économie max, Maintien, Équilibre), puis on confirme ses **besoins** (fréquence des consultations, franchise, modèles de soins, médecin) : le comparateur s'ouvre réglé en conséquence, avec le top 3 de chaque personne et des onglets pour passer d'un membre à l'autre ;
3. le **comparateur** (offres détaillées, comparaison côte à côte de 2 à 4 offres, coût sans frais / attendu / année chargée) classe les caisses de votre région selon le **coût total attendu** (prime nette de CO2 + franchise + quote-part), avec un simulateur de franchise, le portrait de chaque caisse (réserves, frais administratifs, taille, évolution de ses primes face au marché) et l'explication de chaque modèle ;
4. un **garde-fou LCA** (confirmation explicite) empêche de résilier une complémentaire par erreur ;
5. la page **Démarches** guide pas à pas, avec une **signature à l'écran** apposée sur les courriers PDF : demande d'affiliation à la nouvelle caisse (PDF et e-mail prérempli, complémentaires souhaitées comprises), résiliation chez l'ancienne, puis confirmations ;
6. les **lettres de résiliation PDF** (format enveloppe à fenêtre suisse) sont générées en un geste, avec suivi des envois recommandés et rappels avant le 30 novembre ;
7. l'**historique pluriannuel** garde les primes réellement payées, les économies des rituels et la position du foyer dans le marché ;
8. la **police PDF** peut être importée à tout moment (*Foyer › Importer une police*) : caisse, personnes, tarif officiel, franchise, prime, numéro d'assuré (ou AVS) et complémentaires sont repris, sans service externe.

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
mkdir -p data && sudo chown 1000:1000 data   # le conteneur tourne en utilisateur 1000 (node)
docker compose up -d
```

Le dossier `data/` doit exister **avant** le premier `docker compose up` et appartenir à l'utilisateur 1000 : sinon Docker le crée pour `root`, l'app ne peut pas y écrire sa base et le conteneur s'arrête avec un message qui rappelle la commande `chown`.

L'app répond sur `http://<ip-du-pi>:3000`. Les données vivent dans `~/lamal-tracker/data` (un seul fichier SQLite). **Au premier démarrage, l'app demande de créer le compte administrateur** (courriel et mot de passe), puis de le protéger d'une passkey ou du double facteur avant toute autre chose.

Si l'app n'est jointe qu'à travers Tailscale (voir ci-dessous), n'exposez le port qu'en local en remplaçant `"3000:3000"` par `"127.0.0.1:3000:3000"` dans `docker-compose.yml` : les autres appareils du réseau local ne voient plus le port.

Pour **figer une version** (et pouvoir revenir en arrière), remplacez `:latest` par le tag `sha-xxxxxxx` du commit voulu (visible dans *Packages* sur GitHub) : `image: ghcr.io/nayton-corp/lamal-tracker:sha-xxxxxxx`. L'image `:latest` n'est publiée qu'une fois la CI (lint, tests, build, e2e) passée.

Variables utiles (dans `docker-compose.yml`, ou dans un fichier `.env` en `chmod 600` via `env_file`) :

| Variable | Rôle |
|---|---|
| `IMPORT_CANTONS` | Ex. `VD` : n'importe que votre canton (≈ 3 Mo par an au lieu de ≈ 60 Mo). |
| `VAPID_SUBJECT` | `mailto:` de contact pour les notifications push. |
| `OFSP_AUTO_CHECK=false` | Désactive le contrôle automatique des nouvelles primes. |
| `OFSP_PREMIUMS_URL` | Force l'URL du fichier de primes si l'OFSP la change. |
| `PINGEN_CLIENT_ID`, `PINGEN_CLIENT_SECRET`, `PINGEN_ORGANISATION_ID` | Facultatif : envoi des lettres en recommandé par [Pingen](https://www.pingen.ch) (voir ci-dessous). Sans ces trois variables, l'option n'apparaît pas. |
| `PINGEN_STAGING=true` | Utilise l'environnement de test de Pingen : rien n'est imprimé ni posté. |
| `APP_URL` | Adresse publique de l'app (ex. `https://primes.exemple.ch`). Sert aux liens des courriels et aux passkeys ; nécessaire pour envoyer des courriels. |
| `SMTP_URL`, `MAIL_FROM` | Service d'envoi de courriels (ex. `smtps://utilisateur:motdepasse@smtp.exemple.ch:465`, `Primes LAMal <no-reply@exemple.ch>`) : confirmation d'adresse, mot de passe oublié, alertes de connexion. |
| `TRUSTED_PROXY_HOPS` | Nombre de mandataires inverses devant l'app (`1` derrière Caddy ou `tailscale serve`), pour lire la vraie adresse IP dans la limitation de débit. Défaut `0`. |
| `ADMIN_REQUIRE_2FA=false` | Lève l'obligation, pour l'administrateur, d'avoir une passkey ou le double facteur (instance strictement personnelle, déconseillé). |
| `HIBP_DISABLED=true` | Ne vérifie pas les nouveaux mots de passe auprès de Have I Been Pwned (serveur sans Internet). |
| `CONTACT_EMAIL` | Adresse affichée dans la déclaration de confidentialité pour les demandes d'accès ou de suppression. |
| `MASTER_KEY` ou `MASTER_KEY_FILE` | Clé maître du chiffrement (32 octets en base64, `openssl rand -base64 32`), ou chemin du fichier qui la contient (secret Docker). Sans elles, l'app crée `data/master.key` au premier démarrage (voir ci-dessous). |

#### Comptes, invitations et courriels

- **Inviter un foyer** : *Réglages › Administration › Inviter un foyer* crée un lien d'inscription (nombre d'utilisations et durée au choix, affiché une seule fois). La personne choisit son courriel et son mot de passe (12 caractères au moins, refusé s'il figure dans une fuite connue), confirme son adresse, puis l'accueil guidé crée son foyer. Une passkey lui est proposée dès l'inscription.
- **Partager son foyer** : *Foyer › Accès au foyer › Inviter une personne* (propriétaire du foyer) crée un lien valable 48 heures, à usage unique. Le conjoint arrive directement dans le foyer, comme membre : il voit et prépare tout, mais ne peut ni inviter, ni retirer quelqu'un, ni tout effacer.
- **Courriels** : sans `SMTP_URL` et `APP_URL`, l'app n'envoie rien. L'inscription ouvre alors le compte sans confirmer l'adresse, et seul l'administrateur peut rétablir un accès perdu (commandes ci-dessous). Un service européen avec domaine authentifié (SPF, DKIM, DMARC) est conseillé ; les courriels ne contiennent aucune donnée de santé.
- **Administration** : comptes (courriel, facteurs, dernière activité ; jamais le contenu des foyers), suspension d'un compte, et envoi Pingen autorisé foyer par foyer (il est facturé à l'exploitant).
- **Mise à jour d'une instance existante** : le mot de passe actuel reste celui de l'administrateur, qui se connecte en laissant le courriel vide jusqu'à ce qu'il en enregistre un dans *Mon compte* ; il doit d'abord ajouter une passkey ou activer le double facteur. Pingen reste ouvert à son foyer.

#### Envoi en recommandé par Pingen (facultatif)

Dans *Démarches*, chaque lettre peut être imprimée et postée par soi-même, ou confiée à Pingen, qui l'imprime avec la signature dessinée à l'écran et la remet à la Poste en recommandé (facturé sur votre compte Pingen ; le n° de suivi et le prix remontent seuls dans l'app, vérifiés toutes les heures).

1. Créer un compte sur [app.pingen.com](https://app.pingen.com) (et, pour essayer, un compte sur l'environnement de test).
2. Dans l'organisation : *Réglages › API*, créer un client OAuth de type `client_credentials`, noter l'identifiant et le secret (affiché une seule fois), ainsi que l'UUID de l'organisation.
3. Les placer dans le fichier `.env` (en `chmod 600`) puis `docker compose up -d`.

Une signature imprimée n'est pas une signature manuscrite (art. 14 CO) : les caisses l'acceptent en général, mais pour une résiliation sans aucun risque, signez à la main. Une lettre refusée par Pingen (adresse illisible, par exemple) est signalée par une notification et peut être reprise.

### 4. HTTPS pour l'installation sur le téléphone et les notifications

Un navigateur n'autorise l'installation d'une PWA, le mode hors ligne et les notifications que sur **HTTPS**. Le plus simple : [Tailscale](https://tailscale.com) (gratuit), qui donne aussi l'accès depuis l'extérieur sans ouvrir de port.

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale serve --bg 3000
```

L'app est alors disponible sur `https://<nom-du-pi>.<votre-tailnet>.ts.net` depuis tout appareil connecté à Tailscale. Sur iPhone : Safari › Partager › *Sur l'écran d'accueil*, puis *Réglages › Rappels › Activer*.

Sans HTTPS, l'app fonctionne normalement dans le navigateur ; seules l'installation, le hors-ligne et les notifications sont indisponibles.
#### Chiffrement et clé maître

Les signatures dessinées et les secrets du double facteur sont chiffrés dans la base (AES-256-GCM, une clé par foyer, elle-même chiffrée par la clé maître). La clé maître ne vit jamais dans la base : une copie de `lamal.db` seule ne permet pas de les lire.

- **Sans réglage** (instance du Pi) : au premier démarrage, l'app crée `data/master.key` (lisible par le seul propriétaire) et chiffre les signatures existantes. **Copiez ce fichier hors du Pi**, à part des sauvegardes de la base : sans lui, une base restaurée garde tout sauf les signatures (à redessiner) et le double facteur (les codes de secours restent valables).
- **Sur un serveur partagé**, préférez un secret hors du volume de données : `MASTER_KEY_FILE=/run/secrets/lamal_master_key` (secret Docker), ou `MASTER_KEY` dans le fichier `.env` en `chmod 600`. Pour reprendre la clé déjà créée par l'app, recopiez le contenu de `data/master.key`.
- Ne changez jamais la clé d'une instance en service : ce qui a été chiffré avec l'ancienne devient illisible.
- La copie automatique prise avant la migration de cette version (`data/backups/`) contient encore les signatures en clair : supprimez-la une fois la mise à jour vérifiée.

#### Données des utilisateurs

- **Mes données** (*Mon compte › Mes données*) : après confirmation de l'identité (mot de passe ou passkey, valable 10 minutes), chacun télécharge une copie complète de ses données (JSON) et un récapitulatif lisible (PDF), et supprime son compte. Seul dans son foyer, le foyer part avec lui ; sinon il reste aux autres membres, le plus ancien en devenant propriétaire. Le propriétaire peut aussi supprimer le foyer (tout ce qu'il contient, pour tous ses comptes ; les comptes restent).
- **Comptes inactifs** : sans connexion depuis 24 mois, un compte reçoit deux rappels par courriel (30 et 7 jours avant), puis il est supprimé. Sans courriel configuré, rien n'est supprimé. L'administrateur n'est jamais concerné.
- Le seul compte administrateur ne peut pas être supprimé depuis l'app.

### Mise à jour, sauvegarde

```sh
cd ~/lamal-tracker && docker compose pull && docker compose up -d
```

- **Sauvegarde** : *Réglages › Sauvegarde* télécharge une copie cohérente de la base. Ou, sur le Pi : `cp data/lamal.db* /un/autre/disque/` (app arrêtée), ou `sqlite3 data/lamal.db ".backup '/chemin/sauvegarde.db'"`. Gardez aussi la clé maître (`data/master.key`), séparément.
- **Sauvegarde automatique avant migration** : quand une mise à jour modifie le schéma, l'app copie d'abord la base dans `data/backups/lamal-<date>.db` (les cinq dernières copies sont gardées). Si la migration échoue, le journal du conteneur (`docker logs lamal-tracker`) indique la copie à restaurer et l'app refuse de démarrer.
- **Restauration** : arrêter le conteneur, remettre le fichier `lamal.db` dans `data/` (et supprimer `lamal.db-wal` / `lamal.db-shm`), relancer. Pour revenir à une version antérieure du code, épingler son tag `sha-…` (voir plus haut).
- Les migrations du schéma s'appliquent seules au démarrage.
- **Mon compte** (*Réglages › Mon compte*) : courriel, mot de passe, passkeys, double facteur et codes de secours, appareils connectés, activité récente (cinq échecs de connexion verrouillent le compte quelques minutes ; les sessions expirent après 30 jours sans visite, et au plus tard après 90 jours).
- **Recommencer à zéro** (*Mon compte › Mes données › Supprimer le foyer*, propriétaire du foyer, identité confirmée) : efface personnes, contrats, rituels, lettres et signatures du foyer, pour tous ses comptes ; les primes officielles et les comptes restent.
- **Mot de passe oublié** : avec les courriels configurés, *Mot de passe oublié ?* sur la page de connexion envoie un lien valable une heure (le double facteur reste exigé). Sinon, pour l'administrateur, cette commande efface son mot de passe et ferme ses sessions ; l'app en redemande un au prochain chargement. Le foyer et ses données restent.

  ```sh
  docker exec lamal-tracker node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/lamal.db').exec(\"UPDATE app_user SET password='{\\\"salt\\\":\\\"\\\",\\\"hash\\\":\\\"\\\",\\\"cost\\\":0}', failed_logins=0, locked_until=NULL WHERE role='ADMIN'; DELETE FROM session\")"
  ```

- **Téléphone du double facteur perdu, sans code de secours** (administrateur) : cette commande retire son double facteur et ses passkeys ; il devra en ajouter un à la connexion suivante.

  ```sh
  docker exec lamal-tracker node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/lamal.db').exec(\"UPDATE app_user SET totp_secret=NULL, totp_enabled_at=NULL, totp_last_step=NULL WHERE role='ADMIN'; DELETE FROM recovery_code WHERE user_id IN (SELECT id FROM app_user WHERE role='ADMIN'); DELETE FROM passkey WHERE user_id IN (SELECT id FROM app_user WHERE role='ADMIN'); DELETE FROM session\")"
  ```

- Les journaux du conteneur sont limités (3 × 10 Mo) pour ne pas remplir la carte SD.

### Construire l'image sur le Pi (alternative)

Cloner le dépôt sur le Pi, décommenter `build: .` dans `docker-compose.yml`, puis `docker compose up -d --build` (compter une dizaine de minutes sur un Pi 4).

## Le rituel d'automne, pas à pas

| Quand | Quoi |
|---|---|
| Une fois | *Foyer* : adresse, canton, **région de primes** (sur la police), membres, puis le contrat LAMal de l'année en cours de chacun, saisi ou importé depuis le PDF de la police. Ajouter les **complémentaires LCA** (garantie choisie dans une liste, assureur prérempli d'après la caisse LAMal). Les adresses des caisses viennent de l'annuaire officiel ; ne les modifier que si la police en indique une autre. |
| Fin septembre | L'OFSP publie les primes ; l'app les importe (contrôle quotidien du 15 septembre au 30 novembre) et envoie une notification. Import manuel possible dans *Réglages*. |
| Octobre | L'analyse s'ouvre seule. *Rituel* : reconduction tacite, choix de la **stratégie**, questionnaire des **besoins**, puis comparateur par personne (top 3, filtres, comparaison côte à côte, simulateur de franchise) et choix. |
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
