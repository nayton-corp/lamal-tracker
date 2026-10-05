# Architecture

Ce document explique comment le code est organisé et pourquoi. Il suppose que vous connaissez les
notions métier ([concepts.md](concepts.md)) et le vocabulaire ([glossaire.md](glossaire.md)).
Les tables sont décrites dans [modele-de-donnees.md](modele-de-donnees.md), les variables
d'environnement dans [exploitation/configuration.md](exploitation/configuration.md), et le travail
au quotidien (lancer, tester, ajouter une fonctionnalité) dans [developpement.md](developpement.md).

## 1. Vue d'ensemble

L'app est un seul programme Next.js (App Router) qui tourne dans un conteneur Docker, avec une base
SQLite dans un fichier. Il n'y a pas de service séparé : les pages, les actions serveur, les tâches
de fond et l'accès à la base vivent dans le même processus Node.

```
navigateur (PWA) ──HTTP──► proxy.ts ──► page ou action serveur ──► application ──► domaine
                                                                        │
                                                                        └──► infrastructure (SQLite, PDF, courriel, OFSP, Pingen, push)
instrumentation.ts ──► planificateur horaire (server/watch.ts) ──► application / infrastructure
```

## 2. Arborescence

```
src/
  proxy.ts           contrôle d'accès de chaque requête, politique de contenu (CSP) avec nonce
  instrumentation.ts démarre le planificateur des tâches de fond (une passe par heure)
  domain/            métier pur : calculs et règles, sans base, sans framework, sans horloge
    money.ts           centimes entiers (type Rappen), conversions et format « CHF 1’234.50 »
    dates.ts           dates ISO (IsoDate), fuseau Europe/Zurich pour l'affichage, formatTimestamp
    lamal.ts           vocabulaire LAMal : classes d'âge, modèles, années sélectionnables
    age.ts             classe d'âge d'une personne pour une année
    parameters.ts      paramètres légaux d'une année et valeurs légales de repli
    cost.ts            coût annuel attendu, courbes par franchise, point de bascule
    deadlines.ts       échéances (30 novembre, date d'envoi conseillée), isReviewWindowOpen
    reminders.ts       règles des rappels d'envoi et des relances
    comparison.ts      filtres, classement déterministe, statistiques de marché
    renewal.ts         tarif de renouvellement d'un contrat (MATCHED, PROBABLE, AMBIGUOUS, MISSING)
    strategy.ts        stratégies du rituel, profils de consommation, solidité d'une caisse
    ritual-steps.ts    étapes du rituel, leur ordre et quand chacune est faite
    review.ts          garde-fous des décisions, des lettres et du contrôle LCA
    letter.ts          contenu des lettres et des demandes d'offre (indépendant du rendu PDF)
    lca.ts             familles de complémentaires
    insurer.ts         nom affiché, adresse de résiliation et destinataire d'une caisse
    insurer-profile.ts portrait d'une caisse (réserves, frais, évolution des primes)
    pingen.ts          statuts Pingen et conditions d'envoi
    policy-import.ts   lecture du texte d'une police PDF
    text.ts            accents, recherche, noms de fichiers
    ofsp/              lecture d'une ligne OFSP (formats ≤ 2026 et ≥ 2027), rapport d'import
    *.test.ts          tests unitaires, à côté du fichier testé
  application/       cas d'usage : chaque fonction reçoit la base (db) et un Scope
    scope.ts           Scope, cloisonnement des foyers, helpers owned* et find*
    errors.ts          UserError (message affichable), NotFoundError
    review/            le rituel : open, decisions, view, close, lines (index.ts réexporte)
    household.ts, letters.ts, offers.ts, compare.ts, history.ts, strategy.ts, tariffs.ts …
    auth.ts, account.ts, mfa.ts, totp.ts, passkeys.ts, tokens.ts, invitations.ts   comptes
    admin.ts, feedback.ts, usage.ts, ops.ts, audit.ts                             administration
    data-rights.ts, export-report.ts                                              droits sur les données
    reminders.ts, pingen.ts, policy-import.ts, reference-data.ts, insurers.ts, signatures.ts
  infrastructure/    tout ce qui touche l'extérieur
    db/                client.ts (ouverture, migrations, copies), schema.ts (Drizzle), queries.ts,
                       seed.ts (référentiel embarqué), settings.ts (réglages globaux)
    crypto/            vault.ts (chiffrement), legacy.ts (chiffre les anciennes valeurs en clair)
    ofsp/              source (URL officielles), téléchargement, lecture xlsx/csv/zip, import
    reference/         annuaire des caisses, données de surveillance, CO2 (+ data/*.json embarqués)
    regions/           région de primes par code postal (postal-regions.json)
    pdf/               rendu des lettres et du récapitulatif, extraction du texte d'une police
    mail/mailer.ts     envoi SMTP, ou fichiers JSON (MAIL_DIR)
    pingen/client.ts   client de l'API Pingen
    push/push.ts       notifications Web Push (clés VAPID)
    rate-limit.ts      limitation de débit en mémoire
    hibp.ts            mots de passe divulgués (Have I Been Pwned, k-anonymat)
  server/            colle entre Next et le reste : ce qui lit les cookies, les en-têtes, l'horloge
    context.ts         db(), today(), nowIso(), currentYear(), reviewTargetYear()
    auth.ts            pageScope, accountPageScope, requireScope, requireAdminScope, completeLogin
    action.ts          ActionState, toActionError, chfField
    accounts.ts        cookies, adresse IP du client, rateLimit, SETUP_TOKEN, mailDeps
    cookie-names.ts    noms de tous les cookies
    watch.ts, jobs.ts  planificateur et imports OFSP en arrière-plan
    reference.ts, pingen.ts   tâches de fond des référentiels et de Pingen
    operator.ts, onboarding.ts, pdf-response.ts
  cli/main.ts        commandes `pnpm cli …` (import, téléchargement, inspection d'un fichier OFSP)
  app/               routes Next (pages en français : /foyer, /rituel, /donnees…), actions/ (server actions), api/
  ui/                composants d'interface partagés (mobile d'abord, navigation latérale dès 1024 px)
tests/
  unit/              tests d'intégration (Vitest, base en mémoire), dont isolation.test.ts
  e2e/               parcours complets dans un navigateur mobile (Playwright)
  fixtures/          générateur de fichiers de primes synthétiques, PDF de police de test
  pingen-mock.ts     doublure locale de l'API Pingen
drizzle/             migrations SQL versionnées, appliquées au démarrage
```

## 3. Les couches et ce qu'ESLint impose

Chaque couche ne dépend que de celles en dessous d'elle :

```
app/, ui/   →   server/   →   application/   →   domain/
                     \              \
                      └──────────────┴──────►  infrastructure/
```

Trois règles `no-restricted-imports` dans `eslint.config.mjs` font respecter ce découpage :

| Fichiers | Imports interdits | Pourquoi |
|---|---|---|
| `src/domain/**` | les autres couches (alias `@/…` ou chemin relatif), `next`, `react`, `drizzle-orm`, les modules Node (`node:*`, `fs`, `path`, `crypto`, `os`, `child_process`) | Le domaine reste pur et testable seul. |
| `src/application/**` | `@/app/*`, `@/ui/*`, `@/server/*`, `next`, `react` | Les cas d'usage ne dépendent pas de l'interface. |
| `src/app/**`, `src/ui/**` | `drizzle-orm`, `@/infrastructure/db/*` | Aucune requête directe : tout passe par `application`, qui cloisonne les foyers. |

ESLint ne contrôle que les imports. Le fait que le domaine ne lise pas l'horloge (`new Date()`, `Date.now()`) est une
**convention**, vérifiée en revue : la date du jour lui est passée en paramètre, depuis
`server/context.ts`.

## 4. Le chemin d'une requête

Prenons « choisir une offre pour une personne du rituel ».

1. **`src/proxy.ts`** reçoit toutes les requêtes, sauf les fichiers statiques et `/api/health`.
   - Aucun compte en base : tout mène à `/login/creer` (création de l'administrateur).
   - Routes publiques (`/login`, `/inscription`, `/verifier`, `/presentation`, pages légales) : on
     laisse passer.
   - Sinon, il lit le cookie de session. Pas de session : `/` affiche la présentation publique,
     une autre page renvoie vers `/login?next=…`, une route `/api/…` répond 401.
   - Un administrateur sans second facteur est envoyé sur `/compte?requis=1`.
   - Chaque page reçoit une **CSP avec nonce** : seuls les scripts portant le nonce de la requête
     s'exécutent.
2. **Page** (`src/app/rituel/[year]/…/page.tsx`) : elle appelle `pageScope()` pour obtenir le
   `Scope` (les pages du compte utilisent `accountPageScope()`, qui laisse entrer l'administrateur
   sans facteur). Le proxy a déjà contrôlé la session, mais la page le refait : on ne dépend jamais
   du seul proxy.
3. **Action serveur** (`src/app/actions/review.ts`, `decideAction`…) : elle commence par
   `requireScope()` (ou `requireAdminScope()` pour le référentiel et les comptes), lit le
   formulaire, puis appelle le cas d'usage dans un `try`. En cas d'erreur, `toActionError`
   (`server/action.ts`) transforme une `UserError` en message affiché, une `ZodError` en erreurs par
   champ, et relance toute autre erreur (vraie panne). Le formulaire reçoit un `ActionState`
   (`{ ok?, error?, fieldErrors? }`). Les montants saisis passent par `chfField` (centimes).
4. **Cas d'usage** (`src/application/review/decisions.ts`) : il reçoit `db` et le `Scope`. Il
   valide les entrées (Zod pour les formulaires des comptes et du foyer, textes bornés), retrouve les objets désignés par identifiant avec
   `ownedLine`, `ownedLetter`… (`application/scope.ts`), puis écrit dans une transaction.
5. **Domaine** (`src/domain/review.ts`, `cost.ts`…) : calculs purs. La date du jour arrive en
   paramètre (`today()` de `server/context.ts`, fuseau Europe/Zurich, figée par `FAKE_TODAY`).
6. **Infrastructure** (`src/infrastructure/db`) : requêtes Drizzle sur SQLite (une seule
   connexion par processus, `getDb()`).

Les routes `src/app/api/*` (PDF des lettres, export, sauvegarde, import, push) suivent le même
principe avec `currentScope()`.

## 5. Scope et cloisonnement des foyers

Plusieurs foyers partagent la même base. Le foyer d'une requête vient **toujours de la session**,
jamais d'un paramètre envoyé par le navigateur.

Un `Scope` (`application/scope.ts`) contient :

| Champ | Sens |
|---|---|
| `userId` | le compte connecté |
| `householdId` | son foyer, ou `null` tant que l'accueil (`/bienvenue`) ne l'a pas créé |
| `householdRole` | `OWNER` (propriétaire) ou `MEMBER` (membre), ou `null` |
| `isAdmin` | vrai si le compte a le rôle `ADMIN` |

Règles :

- Un objet désigné par son identifiant passe par un helper `owned*` (lève `NotFoundError`) ou
  `find*` (renvoie `null`). Un objet d'un autre foyer est « introuvable » : la réponse est la même
  que s'il n'existait pas.
- `requireOwner` réserve au propriétaire : inviter, retirer un membre, tout effacer.
- `requireAdmin` réserve à l'administrateur : référentiel partagé (primes, caisses, CO2),
  comptes, sauvegarde complète. L'import des primes d'une année (données publiques) reste ouvert à
  tous les comptes, avec une limite de débit.
- `tests/unit/isolation.test.ts` appelle chaque cas d'usage du foyer A avec les identifiants du
  foyer B et exige un refus sans modification ; `tests/e2e/sharing.spec.ts` refait l'essai dans le
  navigateur.

## 6. Comptes et rôles

Il y a deux notions de rôle, à ne pas confondre :

| Rôle | Où | Valeurs | Donne droit à |
|---|---|---|---|
| Rôle du **compte** | `app_user.role` | `ADMIN`, `USER` | L'administrateur gère l'instance (comptes, invitations, référentiel, sauvegarde). |
| Rôle dans le **foyer** | `household_member.role` | `OWNER`, `MEMBER` | Le propriétaire gère le foyer (inviter, retirer, effacer). Le membre consulte, prépare et signe. |

L'administrateur a aussi un foyer à lui, où il est propriétaire. Un compte appartient à un seul
foyer. Le premier compte, créé sur `/login/creer`, est l'administrateur ; les autres arrivent par
invitation (`application/invitations.ts`) : invitation d'inscription (nouveau foyer, créée par
l'administrateur) ou invitation de foyer (rejoindre un foyer existant, créée par son propriétaire).

Les comptes d'une instance d'avant le lot 2 n'avaient pas de courriel : `legacyAdminId` permet
encore à cet administrateur de se connecter en laissant le courriel vide (voir
[exploitation/mises-a-jour.md](exploitation/mises-a-jour.md)).

## 7. Authentification et sessions

Le code est dans `src/application` (`auth.ts`, `account.ts`, `mfa.ts`, `totp.ts`, `passkeys.ts`,
`tokens.ts`, `invitations.ts`) et `src/server/auth.ts` pour la partie Next (cookies, redirections).

**Mot de passe.** 12 caractères au moins, refusé s'il figure dans une fuite connue (Have I Been
Pwned, `infrastructure/hibp.ts`, désactivable). Haché avec scrypt, coût N = 2^16 (64 Mo par
hachage) ; une empreinte plus ancienne (coût plus faible) est refaite à la connexion suivante. Les
messages d'échec sont identiques que le compte existe ou non. Cinq échecs verrouillent le compte,
de plus en plus longtemps (1, 2, 5, 15 puis 30 minutes). Le mot de passe redemandé dans
*Mon compte* (`requirePassword`) compte aussi ses échecs.

**Second facteur.**

- Passkeys (WebAuthn, `@simplewebauthn`, vérification de l'utilisateur exigée). Une passkey suffit
  pour se connecter.
- Double facteur TOTP (RFC 6238), codes non rejouables, avec 10 codes de secours de 16 caractères
  (empreinte propre au compte). Après 10 codes erronés en 24 heures sur un compte, le TOTP est
  bloqué, toutes étapes confondues (`checkSecondFactor`).
- L'administrateur doit avoir une passkey ou le TOTP (`adminNeedsFactor`, appliqué par le proxy,
  `pageScope` et `requireAdminScope`). Un administrateur qui n'a qu'une passkey se connecte avec
  elle : le mot de passe seul est refusé.

**Sessions.** Un jeton aléatoire dans un cookie ; la base n'en garde que l'empreinte (`session`).
Une session expire après **30 jours sans visite** et au plus tard **90 jours** après son ouverture
(`SESSION_DAYS`, `SESSION_MAX_DAYS`). Toutes les sessions d'un compte sont fermées après une
réinitialisation du mot de passe ou une suspension.

**Cookies** (`server/cookie-names.ts`). En HTTPS, chaque nom est préfixé de `__Host-` et seul le
nom préfixé est lu ; en HTTP local (Pi sans HTTPS), le nom simple est utilisé.

| Cookie | Rôle | Durée |
|---|---|---|
| `__Host-lamal_session` | session de connexion | 90 jours au plus |
| `__Host-lamal_device` | appareil connu (alerte de nouvel appareil par courriel) | 400 jours |
| `__Host-lamal_mfa` | connexion en attente du second facteur | 5 minutes |
| `__Host-lamal_totp` | mise en place du TOTP en cours | 15 minutes |
| `__Host-lamal_wa` | défi WebAuthn en cours | 5 minutes |
| `__Host-lamal_mode` | « pour moi seul·e » ou « pour mon foyer », avant que le foyer existe | 7 jours |

**Confirmation d'identité.** Les actions sensibles (export des données, suppression du compte ou
du foyer, sauvegarde de la base) exigent une identité confirmée depuis moins de 10 minutes
(`requireConfirmed`, `CONFIRM_MINUTES`) : connexion récente, ou mot de passe ou passkey redemandés.
Une session ouverte depuis un **lien de confirmation de courriel** n'est pas confirmée : elle
compte comme « jamais confirmée » et la personne doit redonner son mot de passe ou sa passkey
avant une action sensible.

**Lien de confirmation du courriel.** Il faut cliquer « Confirmer » sur la page (un antivirus qui
ouvre le lien ne le consomme pas). Le lien ouvre une session seulement pour la toute première
confirmation d'une inscription, dans les 15 minutes (`AUTO_LOGIN_LINK_MINUTES`), et si le compte
n'a pas encore de second facteur. Sinon il renvoie à la connexion. Un changement d'adresse
prévient l'ancienne adresse.

**Jetons à usage unique** (`auth_token`, hachés, `application/tokens.ts`) : confirmation du
courriel (24 h), réinitialisation du mot de passe (1 h), étape du second facteur (5 min, 5 essais),
défi WebAuthn (5 min).

**Courriels de sécurité.** Le titulaire reçoit un courriel à chaque changement de mot de passe,
de double facteur, de codes de secours ou de passkeys, et lors d'une connexion depuis un nouvel
appareil (`notifySecurityChange`, `completeLogin`). Un courriel en échec n'annule jamais le
changement ; l'erreur est journalisée sans l'adresse (`logMailError`).

**Installation.** La création du compte administrateur, ou la redéfinition de son mot de passe,
exige le code `SETUP_TOKEN`, obligatoire dès que `APP_URL` est en HTTPS (`server/accounts.ts`).

## 8. Limitation de débit et adresse IP

`infrastructure/rate-limit.ts` compte les essais en mémoire, par fenêtre fixe (connexion,
inscription, réinitialisation, actions du compte, analyse de police PDF, import d'une année…). Les
compteurs repartent à zéro au redémarrage ; le verrouillage des comptes, lui, est en base. Une clé
de plus de 200 caractères est remplacée par son empreinte.

L'adresse IP vient de `clientIpFrom` (`server/accounts.ts`) :

- `TRUSTED_PROXY_HOPS=0` (défaut) : l'en-tête `X-Forwarded-For` vient du client et ne prouve rien.
  Il est ignoré et tous les clients partagent la même clé « directe ».
- `TRUSTED_PROXY_HOPS=1` (derrière Caddy) : l'adresse posée par le mandataire est lue. Une adresse
  IPv6 est ramenée à son préfixe /64.

## 9. Chiffrement

Les données les plus sensibles sont chiffrées dans la base (AES-256-GCM,
`infrastructure/crypto/vault.ts`). La clé maître ne vit **jamais** dans la base : une copie de
`lamal.db` seule ne suffit pas à les lire.

```
clé maître  (MASTER_KEY, ou fichier MASTER_KEY_FILE, ou data/master.key créé au premier démarrage)
   │
   ├── chiffre ──► clé du foyer        household_key.wrapped_key   contexte « household-key:<foyer> »
   │                  │
   │                  └── chiffre ──► signature dessinée   signature.data_url   contexte « h<foyer>|signature:<personne> »
   │
   └── chiffre directement ──► secret TOTP   app_user.totp_secret   contexte « totp:<compte> »
```

- **Contexte authentifié (AAD).** Chaque valeur est chiffrée avec un petit texte de contexte (le
  foyer, la personne, le compte). Ce texte n'est pas secret, mais il est vérifié au déchiffrement :
  une valeur recopiée dans une autre ligne ou un autre foyer ne s'ouvre pas.
- **Format.** `v1.` suivi de base64url(nonce de 12 octets, chiffré, tag de 16 octets).
- **Suppression.** Supprimer un foyer supprime sa clé : ses signatures deviennent illisibles, même
  dans une vieille copie. `PRAGMA secure_delete` efface réellement les lignes supprimées du fichier.
- **Valeur illisible** (mauvaise clé maître) : elle compte comme absente. La signature est à
  redessiner, le double facteur se contourne avec un code de secours.
- **Valeurs anciennes en clair** (instance d'avant le lot 3) : chiffrées au démarrage
  (`crypto/legacy.ts`).
- **Contrôle.** `/api/health` vérifie que la clé maître ouvre les clés de foyer et répond 503
  sinon : une base restaurée avec la mauvaise clé se voit tout de suite.

Procédures (générer, sauvegarder, ne jamais changer la clé) :
[exploitation/sauvegarde-restauration.md](exploitation/sauvegarde-restauration.md).

## 10. Tâches de fond

`src/instrumentation.ts` démarre le planificateur au lancement du serveur (sauf si
`DISABLE_SCHEDULER=true`) : une première passe 30 secondes après le démarrage, puis une par heure.
Chaque passe appelle `schedulerTick()` (`server/watch.ts`).

| Tâche | Fréquence | Fichier |
|---|---|---|
| **Import initial** des primes OFSP : les plus récentes publiées, puis celles de l'année en cours. Lancé dès que la base n'a aucun jeu de primes actif (premier démarrage, y compris en développement : il faut le réseau). Pendant cet import, la passe s'arrête là. Si l'archive de l'année en cours manque, nouvel essai au plus une fois par jour. | à chaque passe, tant que nécessaire | `server/watch.ts` (`ensureBaseDatasets`), `server/jobs.ts` |
| **Contrôle d'une nouvelle publication OFSP** (signature HTTP du fichier), import si le fichier a changé, puis notification push à tous. | toutes les 20 h du 15 septembre au 30 novembre, toutes les semaines sinon | `server/watch.ts` (`checkForNewPremiums`) |
| **Référentiels officiels** : annuaire des caisses, données de surveillance, CO2. | une fois par semaine | `server/reference.ts` (`referenceTick`) |
| **Rappels d'envoi** et **relances** de confirmation (calendrier dans [concepts.md](concepts.md#rappels)), par notification push et parfois par courriel. Dédoublonnés par `notification_log`. | à chaque passe | `application/reminders.ts`, règles dans `domain/reminders.ts` |
| **Suivi Pingen** : statut, numéro de suivi, prix ; notification si une lettre est refusée. | à chaque passe | `server/pingen.ts` (`pingenTick`) |
| **Comptes inactifs** : deux rappels (30 et 7 jours avant), puis suppression à 24 mois. Jamais sans courriel configuré, jamais pour un administrateur. | à chaque passe | `application/data-rights.ts` (`inactivityTick`) |
| **Alertes d'exploitation** aux administrateurs : disque presque plein (moins de 10 % ou de 1 Go), 30 échecs de connexion ou plus en une heure. Au plus une par sujet et par jour. | à chaque passe | `application/ops.ts` (`opsTick`) |
| **Purges** : jetons expirés, journal de sécurité de plus de 12 mois. | à chaque passe | `application/tokens.ts`, `application/audit.ts` |

`OFSP_AUTO_CHECK=false` coupe l'import initial, le contrôle OFSP et les référentiels.

**Erreurs et signal de vie.** Chaque tâche est isolée : une erreur est journalisée (`[watch] …`)
et la passe continue. Après la passe, `pingHeartbeat` appelle `HEALTHCHECK_PING_URL` si tout a
réussi, ou `…/fail` si au moins une tâche a échoué (ou si la passe entière a planté) : le service de
surveillance prévient alors l'exploitant.

## 11. Intégrations

**Primes OFSP (open data).** `infrastructure/ofsp/source.ts` demande l'URL du fichier courant à
l'API CKAN d'opendata.swiss, avec repli sur une URL connue. Seuls les hôtes officiels en HTTPS sont
acceptés (`isOfficialUrl`) : `opendata.swiss`, `opendata.bagnet.ch` et `*.admin.ch`, plus l'URL
`OFSP_PREMIUMS_URL` posée par l'exploitant. Le fichier est lu en flux (`reader.ts`) et normalisé
ligne par ligne par le domaine (`domain/ofsp`) : l'OFSP a changé tous ses codes en 2027, le
parseur lit les deux générations et les ramène à une seule forme. Une ligne illisible est rejetée
et comptée, jamais devinée. Le jeu est ensuite validé (années, cantons, bornes des primes,
variation par rapport à l'année précédente) avant d'être activé (`importer.ts`). Le workflow
GitHub *Surveillance du format OFSP* importe le vrai fichier chaque jour en septembre et octobre :
un changement de format se voit avant le rituel. Les archives des années passées (`archive.ts`, dès 2015) servent à l'historique.
Un seul import tourne à la fois (`server/jobs.ts`) ; un import interrompu est marqué `FAILED` au
démarrage suivant. `IMPORT_CANTONS` limite l'import à certains cantons.

**Référentiels officiels** (`infrastructure/reference/`). Une copie est livrée avec l'image
(`reference/data/*.json`, appliquée au démarrage par `db/seed.ts`), puis rafraîchie chaque semaine
depuis les pages de l'OFSP et de l'OFEV. Un workflow GitHub mensuel propose aussi la mise à jour
dans le dépôt (`scripts/build-reference.ts`). Une adresse de caisse modifiée dans l'app n'est
jamais écrasée ; un montant CO2 saisi à la main reste prioritaire. Les régions de primes par code
postal (`regions/postal-regions.json`) sont reconstruites une fois par an par un workflow
(`scripts/build-postal-regions.ts`).

**Pingen** (envoi en recommandé, facultatif). Actif seulement si les trois variables `PINGEN_*`
sont définies et pour les foyers que l'administrateur autorise (`household_setting`
`pingen.enabled`), car l'envoi est facturé à l'exploitant.

1. La lettre est rendue dans une mise en page dédiée (`letter-pdf.tsx`, `layout="pingen"` :
   adresse dans la zone lue par Pingen, zone d'affranchissement vide).
2. Elle est **réservée en base avant l'appel** : jamais deux envois de la même lettre.
3. Le PDF est déposé puis créé avec `delivery_product: "registered"` et envoi automatique, sous un
   nom de fichier unique (`pingenFileName`).
4. Un refus de Pingen remet la lettre « à envoyer ». Une absence de réponse la laisse « non
   confirmée » jusqu'à ce que le suivi horaire la retrouve par son nom de fichier.

Les tests utilisent une doublure locale de l'API (`tests/pingen-mock.ts`, `PINGEN_API_URL`,
`PINGEN_IDENTITY_URL`). Mise en place du compte : [exploitation/pingen.md](exploitation/pingen.md).

**Notifications push** (`infrastructure/push/push.ts`). Les clés VAPID sont créées au premier
usage et gardées dans `settings`. Un abonnement appartient à un compte ; seuls les points d'envoi
des grands navigateurs (Google, Mozilla, Apple, Microsoft) sont acceptés. Une notification peut
viser tous les comptes, un foyer ou un compte ; une clé de dédoublonnage évite les doublons.

**Courriel** (`infrastructure/mail/mailer.ts`). SMTP (`SMTP_URL`), ou un fichier JSON par message
(`MAIL_DIR`, pour le staging et les tests). Les liens sont construits à partir d'`APP_URL`, jamais
de l'en-tête `Host` : sans `APP_URL`, aucun courriel ne part. Les courriels ne contiennent aucune
donnée de santé.

**Police PDF.** Le texte est extrait sur le serveur (`infrastructure/pdf/read-text.ts`, `unpdf`,
30 pages et 200 000 caractères au plus), analysé par `domain/policy-import.ts`, rapproché des
tarifs officiels par `application/policy-import.ts`. Le fichier n'est jamais enregistré.

## 12. Décisions de conception

- **Montants en centimes entiers** (`*_rp`, type `Rappen`) : jamais de nombre à virgule pour de
  l'argent. Les conversions passent par `domain/money.ts`.
- **Paramètres légaux par année.** Franchises, quote-part et redistribution CO2 sont lus dans la
  table `lamal_parameters`, une ligne par année, qui fait foi. `domain/parameters.ts` contient les
  valeurs de la loi en vigueur sous forme de constantes nommées (`LEGAL_DEFAULT_*`). Elles servent
  à remplir une année nouvelle et de repli quand l'année n'a pas encore de ligne
  (`parametersFor`, `infrastructure/db/queries.ts`). Le code métier ne les lit jamais
  directement : il reçoit un objet `LamalParameters`.
- **Jeux de primes immuables.** Un fichier importé donne un jeu (`tariff_dataset`) identifié par
  son empreinte SHA-256. Un nouveau fichier pour la même année devient actif ; l'ancien reste,
  avec le statut `SUPERSEDED`. Réimporter le même fichier ne fait rien.
- **Décisions figées.** Une décision du rituel copie la prime, le tarif et le coût choisis dans
  `review_line` ; une lettre fige son contenu. Un nouvel import ne réécrit jamais l'historique.
- **Garde-fou LCA.** Une lettre de résiliation est refusée tant que le contrôle LCA de la personne
  n'est pas confirmé (`domain/review.ts`).
- **Le domaine ne lit pas l'horloge.** La date est fournie par `server/context.ts`, ce qui rend
  les calculs testables à n'importe quelle date (`FAKE_TODAY`).
- **Minimisation.** Pas de journal d'accès, pas de donnée de santé dans les courriels ni dans le
  journal, police PDF lue en mémoire seulement.

## 13. Le rituel dans le code

Le rituel d'automne s'appelle `review` dans le code. Ses étapes sont typées dans
`domain/ritual-steps.ts` ; les routes sont sous `/rituel/[year]` : page d'accueil (reconduction
tacite), `strategie`, `besoins`, `comparer` et `personne/[lineId]`, `lca`, `lettres` (Démarches).
L'année visée est toujours l'année prochaine (`reviewTargetYear()`). Pendant la fenêtre de
changement (`isReviewWindowOpen` : primes publiées et échéance du 30 novembre pas encore passée),
la page ouvre le rituel toute seule (`openReviewIfPossible`). Les statuts et transitions sont
décrits dans [modele-de-donnees.md](modele-de-donnees.md).

## 14. Sécurité de l'interface

- En-têtes posés par `next.config.ts` sur toutes les réponses (`nosniff`, `X-Frame-Options`,
  `Referrer-Policy`, COOP, `Permissions-Policy`) et CSP à nonce par `proxy.ts` sur les pages.
  HSTS est posé par le mandataire HTTPS (Caddy).
- Corps de requête limité à 25 Mo (`proxyClientMaxBodySize` et `serverActions.bodySizeLimit`).
- `safeNext` n'accepte qu'un chemin local comme retour après connexion.
- Le service worker (`public/sw.js`) oublie les pages privées mises en cache dès le retour vers
  la connexion.
- `/.well-known/security.txt` est publié si `CONTACT_EMAIL` est défini.

Le modèle de menace et l'état des constats de sécurité sont dans
[securite/README.md](securite/README.md).
