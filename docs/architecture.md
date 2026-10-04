# Architecture

```
src/
  domain/          Métier pur (aucune dépendance : ni Next, ni base, ni Node, ni horloge)
    money.ts         montants en centimes entiers ; format « CHF 1’234.50 »
    age.ts           classe d'âge LAMal d'une année (enfant ≤18, jeune 19–25, adulte 26+)
    parameters.ts    franchises, quote-part, redistribution CO2 : par année, jamais en dur
    cost.ts          coût annuel attendu, courbes par franchise, point de bascule
    deadlines.ts     30 novembre (ramené au jour ouvrable), date d'envoi conseillée, rappels
    comparison.ts    filtres, classement déterministe, statistiques de marché
    renewal.ts       retrouve le tarif de renouvellement (code, lignée confirmée, modèle)
    review.ts        garde-fous des lettres et du contrôle LCA
    pingen.ts        envoi par Pingen : avancement d'un statut, conditions (signatures, adresse)
    letter.ts        contenu des lettres et des demandes d'offre (indépendant du rendu)
    lca.ts           familles de garanties complémentaires
    policy-import.ts lecture d'une police (texte du PDF) : personnes, franchise, modèle, montants, complémentaires
    insurer-profile.ts portrait d'une caisse : réserves en mois de primes, frais, évolution des primes
    strategy.ts      stratégies du rituel (économie max, maintien, équilibre), points de solidité d'une caisse,
                     profils de consommation
    ofsp/            lecture d'une ligne OFSP (formats ≤2026 et ≥2027), rapport d'import
  application/     Cas d'usage : foyer, revue annuelle, comparateur, lettres, historique ; scope.ts cloisonne les foyers
  infrastructure/  SQLite (Drizzle), import OFSP en flux, rendu PDF, notifications push, client Pingen,
                   référentiels officiels (reference/ : annuaire OFSP, surveillance OFSP, CO2 OFEV)
  server/          Contexte serveur (horloge Europe/Zurich, tâches d'import, planificateur)
  app/             Pages Next.js (App Router) et server actions
  ui/              Composants d'interface (design system) : mobile d'abord ; dès 1024 px, navigation latérale (AppNav),
                   pages élargies (Page wide) et panneaux (Sheet) affichés en fenêtre centrée
```

Les frontières sont imposées par ESLint (`no-restricted-imports`) : le domaine n'importe rien
d'extérieur ; l'application ne dépend pas de l'interface.

## Principes

- **Argent** : centimes entiers partout (`*_rp`). Les conversions passent par `domain/money.ts`.
- **Référentiel immuable** : un jeu de primes par fichier (empreinte SHA-256). Un nouveau fichier
  pour la même année remplace l'actif ; l'ancien reste (statut `SUPERSEDED`).
- **Décisions figées** : une décision copie la prime, le tarif et le coût choisis dans
  `review_line` ; une lettre fige son contenu. Un réimport ne réécrit jamais l'historique.
- **Le domaine ne lit pas l'horloge** : la date du jour est fournie (`server/context.ts`,
  fuseau Europe/Zurich, surchargeable par `FAKE_TODAY` pour les tests).
- **Garde-fou LCA** : une lettre de résiliation est refusée tant que le contrôle LCA de la
  personne n'est pas confirmé (`domain/review.ts`, testé).

## Modèle de données

- Référentiel : `tariff_dataset` → `tariff` (code, libellé, type de modèle par caisse) → `premium`
  (canton, région, classe d'âge, sous-groupe, accident, franchise, prime mensuelle) ; `insurer`
  (n° OFSP, nom, coordonnées officielles de l'annuaire, adresse propre facultative) ;
  `insurer_indicator` (comptes publiés par caisse et par année) ; `lamal_parameters` (par année,
  CO2 officiel ou saisi). Partagé par tous les foyers ; seul l'administrateur le modifie.
- Comptes : `app_user` (courriel, mot de passe haché scrypt, rôle `ADMIN` ou `USER`, verrouillage
  après échecs, secret TOTP, consentement, suspension), `household_member` (un compte appartient à
  un foyer, propriétaire ou membre), `session` (par compte et par appareil), `passkey` (WebAuthn),
  `recovery_code`, `invitation` (inscription ou foyer, code haché), `auth_token` (jetons à usage
  unique hachés : confirmation, réinitialisation, étape du double facteur, défi WebAuthn),
  `known_device` (alerte de nouvel appareil), `audit_event` (journal de sécurité du compte et du
  foyer, 12 mois). `app_user` garde aussi la dernière activité et les rappels d'inactivité ;
  `session.confirmed_at`, la dernière confirmation d'identité.
- Foyer : `household`, `household_setting` (dont le mode « une personne / foyer »), `person`,
  `lamal_policy` (un contrat par personne et par année, prime réellement facturée), `lca_policy`,
  `tariff_lineage` (correspondance d'un code tarif d'une année à l'autre, confirmée par le foyer).
- Rituel : `review` (une par année cible, stratégie choisie, besoins confirmés), `review_line`
  (franchise et modèles souhaités), (une par personne, complémentaires à
  demander), `letter`, `offer_request` (demande d'offre à une nouvelle caisse, contenu figé).
- Signature dessinée par personne (`signature`, PNG chiffré par la clé du foyer), apposée sur les
  PDF au rendu ; `household_key` (clé du foyer, chiffrée par la clé maître).
- Divers : `settings` (réglages globaux : signature du fichier OFSP, clés VAPID…), `push_subscription`
  (par compte), `notification_log` (rappels dédoublonnés ; clé préfixée `h<foyer>:` pour un rappel de foyer).

## Cloisonnement des foyers

Plusieurs foyers partagent la base. Le foyer d'une requête vient toujours de la session
(`server/auth.ts` : `pageScope`, `requireScope`), jamais d'un paramètre envoyé par le navigateur.

- Chaque cas d'usage de `src/application` reçoit un `Scope` (compte, foyer, administrateur ou non).
- Un objet désigné par son identifiant passe par `application/scope.ts` (`owned*`, `find*`) :
  un objet d'un autre foyer est « introuvable », la réponse est la même que s'il n'existait pas.
- Les pages et actions n'importent ni Drizzle ni le schéma (règle ESLint) : pas de requête
  directe qui contournerait ces contrôles.
- Le référentiel (primes, caisses, CO2) et la sauvegarde complète de la base sont réservés à
  l'administrateur ; l'import des primes d'une année (données publiques) reste ouvert à tous.
- `tests/unit/isolation.test.ts` appelle chaque cas d'usage du foyer A avec les identifiants du
  foyer B et exige un refus, sans aucune modification ; `tests/e2e/sharing.spec.ts` refait
  l'essai dans le navigateur avec un second compte.
- Dans un foyer, le propriétaire seul invite, retire un membre ou efface tout (`requireOwner`).

## Comptes et authentification

Le module est isolé dans `src/application` (`auth.ts`, `account.ts`, `mfa.ts`, `passkeys.ts`,
`invitations.ts`, `admin.ts`) pour pouvoir déléguer plus tard à un fournisseur OIDC.

- **Inscription sur invitation** (`invitations.ts`, `account.ts`) : code haché, compteur d'usages
  avancé dans la transaction de création du compte. Une adresse déjà inscrite n'est pas révélée.
- **Mot de passe** : 12 caractères au moins, refusé s'il figure dans Have I Been Pwned
  (k-anonymat, `infrastructure/hibp.ts`). Messages d'échec identiques que le compte existe ou non.
- **Second facteur** : passkeys (`@simplewebauthn`, vérification de l'utilisateur exigée ; une
  passkey suffit à se connecter) et TOTP (RFC 6238, `totp.ts`, codes non rejouables) avec dix codes
  de secours. Obligatoire pour l'administrateur (`adminNeedsFactor`, appliqué par le proxy,
  `pageScope` et `requireAdminScope`) ; un administrateur sans TOTP mais avec une passkey ne se
  connecte pas par mot de passe seul. 10 codes erronés par compte et par 24 h bloquent le TOTP
  (`checkSecondFactor`), quel que soit le nombre d'étapes ou de liens ouverts.
- **Installation** : la création du compte administrateur (ou la redéfinition de son mot de passe)
  exige `SETUP_TOKEN`, obligatoire dès qu'`APP_URL` est en HTTPS.
- **Jetons** : liens de confirmation (24 h) et de réinitialisation (1 h), étape du double facteur
  (5 min, 5 essais), défis WebAuthn (5 min) ; tous à usage unique, hachés (`tokens.ts`).
- **Sessions et cookies** : préfixe `__Host-` en HTTPS (seul lu en HTTPS), 30 jours sans visite, 90 jours au plus ;
  toutes fermées après une réinitialisation ou une suspension.
- **Limitation de débit** en mémoire par IP et par compte (`infrastructure/rate-limit.ts`) sur la
  connexion, l'inscription, la réinitialisation et les actions du compte. L'IP vient de
  `X-Forwarded-For` seulement derrière un mandataire de confiance (`TRUSTED_PROXY_HOPS`), IPv6
  ramenée au /64 (`server/accounts.ts`, `clientIpFrom`).
- **En-têtes** (`proxy.ts`, `next.config.ts`) : CSP avec nonce par requête (`script-src 'nonce-…'
  'strict-dynamic'`, `frame-ancestors 'none'`), `Permissions-Policy`, COOP, `nosniff`,
  `Referrer-Policy` ; HSTS posé par Caddy. `/.well-known/security.txt` publié si `CONTACT_EMAIL`
  est défini.
- **Courriels** (`infrastructure/mail/mailer.ts`) : SMTP, ou fichiers JSON pour les tests
  (`MAIL_DIR`). Les liens sont construits à partir d'`APP_URL`, jamais de l'en-tête Host.
- **Pingen** n'est proposé qu'aux foyers autorisés par l'administrateur (`household_setting`
  `pingen.enabled`), puisqu'il est facturé à l'exploitant.

## Protection des données

- **Chiffrement** (`infrastructure/crypto/vault.ts`) : AES-256-GCM, une clé par foyer
  (`household_key`), chiffrée par la clé maître (`MASTER_KEY`, `MASTER_KEY_FILE` ou
  `master.key` à côté de la base, jamais dans la base). Le contexte (foyer, personne, compte) est
  authentifié : une valeur recopiée ailleurs ne s'ouvre pas. Sont chiffrés les signatures et les
  secrets TOTP (ceux-ci directement par la clé maître). Les valeurs enregistrées en clair avant
  le chiffrement le sont au démarrage (`crypto/legacy.ts`). Une valeur illisible (clé changée)
  compte comme absente : signature à refaire, codes de secours pour le double facteur.
- **Suppression** : `PRAGMA secure_delete` efface réellement les lignes supprimées du fichier.
  Supprimer un foyer supprime sa clé (`household.eraseHousehold`) ; supprimer un compte
  (`data-rights.deleteAccountData`) supprime le foyer s'il y était seul, sinon le transmet.
- **Droits** (`application/data-rights.ts`) : export JSON complet et récapitulatif PDF
  (`export-report.ts`, `infrastructure/pdf/report-pdf.tsx`), sans mot de passe, secret ni clé ;
  export et suppressions exigent une identité confirmée depuis moins de 10 minutes
  (`requireConfirmed` : connexion récente, mot de passe ou passkey du compte).
- **Inactivité** : passe quotidienne du planificateur (`inactivityTick`) ; deux rappels, puis
  suppression à 24 mois ; jamais sans courriel possible, jamais pour un administrateur.
- **Minimisation** : une police PDF importée n'est lue qu'en mémoire, jamais enregistrée ; les
  courriels et le journal ne contiennent aucune donnée de santé.

Une modification du schéma : éditer `src/infrastructure/db/schema.ts`, puis `pnpm db:generate`
(migration SQL dans `drizzle/`, appliquée au démarrage).

## Tâches de fond

`src/instrumentation.ts` lance un planificateur horaire : contrôle de la signature HTTP du
fichier OFSP (quotidien du 15.09 au 30.11, hebdomadaire sinon), import en arrière-plan si
le fichier a changé, notification ; rappels d'envoi et relances de confirmation (`application/reminders.ts`, règles pures dans
`domain/reminders.ts` : seulement les foyers qui ont encore un courrier à poster) ; vérification hebdomadaire des
référentiels officiels (`server/reference.ts`) ; suivi des lettres confiées à Pingen (statut, n° de suivi, prix ; notification
en cas de refus) ; rappels et suppression des comptes inactifs ; alertes d'exploitation aux
administrateurs (`application/ops.ts` : disque presque plein, vague d'échecs de connexion, une fois
par jour au plus). Chaque passage appelle `HEALTHCHECK_PING_URL` (ou `…/fail` en cas d'erreur).

`/api/health` (public, sans donnée) vérifie la base et que la clé maître ouvre les clés de foyer :
503 sinon, ce qui signale tout de suite une base restaurée avec la mauvaise clé.

## Exploitation

`deploy/` décrit le serveur public (voir `docs/mise-en-ligne.md`) : Caddy (HTTPS, HSTS, staging
derrière mot de passe), production et staging séparés (bases et clés maîtres distinctes),
conteneurs en lecture seule sans privilèges, Litestream (réplication continue chiffrée par age
vers un stockage S3 suisse), chien de garde et test de restauration quotidien (systemd), mise en
production après le staging avec gel du 16 au 30 novembre (`deploy.sh`). La CI bloque sur
`pnpm audit`, TruffleHog, Trivy (image) et un scan ZAP passif ; Dependabot propose les mises à jour.

## Envoi par Pingen

Facultatif, actif seulement si `PINGEN_CLIENT_ID`, `PINGEN_CLIENT_SECRET` et `PINGEN_ORGANISATION_ID` sont définis,
et pour les seuls foyers que l'administrateur y autorise.
La lettre est rendue dans une mise en page dédiée (`letter-pdf.tsx`, `layout="pingen"` : adresse dans la zone lue par
Pingen, zone d'affranchissement vide, mention du recommandé déplacée au-dessus de l'objet), déposée puis créée avec
`delivery_product: "registered"` et envoi automatique. La lettre est réservée en base avant l'appel (jamais deux envois) ;
un refus de Pingen la remet « à envoyer », une absence de réponse la laisse « non confirmée » jusqu'à ce que le suivi la
retrouve par son nom de fichier. Les tests utilisent une doublure locale de l'API (`tests/pingen-mock.ts`).

## Parcours

- `/login/creer` puis `/login` : mot de passe obligatoire choisi au premier démarrage (hash scrypt dans
  `settings`), sessions aléatoires en base (`session`, 30 jours glissants), vérification dans `proxy.ts` et
  `requireSession()` en tête de chaque server action (`server/auth.ts`, `application/auth.ts`).
- `/bienvenue` : accueil de la première connexion. Seul·e : pour qui → vous (identité + adresse, ou la
  police PDF qui remplit tout) → contrat. Foyer : pour qui → adresse (ou police PDF) → personnes → contrats.
  Une deuxième personne fait passer en mode foyer.
- `/rituel/[année]` : reconduction tacite → `strategie` → `besoins` → `comparer` (onglets par personne)
  → `lca` → `lettres` (démarches, signature) → clôture. L'analyse s'ouvre seule pendant la fenêtre
  du rituel (`ritualWindowOpen`, `ensureReview`).
- Police PDF : texte extrait sur le serveur (`unpdf`), analyse pure dans `domain/policy-import.ts`
  (caisse, année, personnes par date de naissance, numéros d'assuré / police / AVS, adresse du titulaire),
  rapprochement avec les tarifs officiels dans `application/policy-import.ts`.
