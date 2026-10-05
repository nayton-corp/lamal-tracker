> Instantané daté du 4 octobre 2026, non tenu à jour : l'état actuel est dans [README.md](README.md).

# Revue de sécurité OWASP ASVS 4.0.3 — Primes LAMal

Date : 4 octobre 2026. Code revu : `main` au commit `7e6c6ee`, plus les travaux du lot 5 alors en cours.
Périmètre : niveau 1 sur toute l'app ; niveau 2 pour V2 (authentification), V3 (sessions) et V4 (contrôle d'accès).
Revue en lecture seule, faite avant les corrections (voir le suivi ci-dessous).

## Suivi des corrections

Le suivi à jour est dans [README.md](README.md#état-des-constats). En bref, au 5 octobre 2026 :
F1 à F8, F11, F13, F15, F16 et F17 sont corrigés, F14 l'est en partie, F9, F10 et F12 sont
acceptés. Les corrections faites après cette revue (F7, F8, F11, F16, F17 et les points « À
vérifier » 3, 4 et 8) sont décrites dans les messages des commits « Sécurité : … » (`git log`).
Reste ouvert : le plafond de taille décompressée d'une archive importée (« À vérifier » n° 5).

Contrôles automatiques de la CI : `pnpm audit` (prod, haute et critique), TruffleHog (secrets dans
tout l'historique), Trivy (image, failles hautes et critiques corrigibles), scan ZAP passif des
pages publiques (avertissements connus justifiés dans `.zap/rules.tsv`), Dependabot.

## Méthode et réserves

- J'ai lu le code des couches `proxy`, `server`, `application`, `app/actions`, `app/api`, `infrastructure` (crypto, rate-limit, ofsp, pingen, push, hibp) ainsi que `next.config.ts`, `Dockerfile`, `scripts/entrypoint.sh`, `public/sw.js` et `deploy/`.
- J'ai fait des vérifications dynamiques sur une copie du build standalone (`.next/standalone`, BUILD_ID `IcZCWI0LMjBJzJdvsYZd9`), lancée depuis le dossier scratchpad avec une base jetable. Les requêtes passaient par curl, et les server actions étaient appelées avec leur ID réel.
- **Arbre de travail modifié pendant la revue (par une autre session, pas par moi).** Les changements non commités touchent `next.config.ts`, `src/proxy.ts` (CSP à nonce), `src/server/accounts.ts` et `src/app/login/*` (`SETUP_TOKEN`), `src/app/api/health/route.ts`, `src/infrastructure/crypto/vault.ts`, ainsi que les nouveaux `deploy/` et `src/app/.well-known/`. Les références `fichier:ligne` ci-dessous suivent **l'arbre de travail actuel**. Les essais dynamiques ont tourné sur le build de HEAD, sans ces changements. Quand un verdict dépend de ces travaux en cours, c'est indiqué « (en cours, non commité) ».
- `pnpm audit --prod` (pnpm 10.28.0) : **aucune vulnérabilité connue** sur 386 dépendances de production (info 0 / low 0 / moderate 0 / high 0 / critical 0). Le réseau a fonctionné.

---

## Constats prioritisés

### F1 — élevée — L'administrateur protégé par une passkey seule se connecte avec son seul mot de passe (ASVS 4.3.1, 2.2.x)

- **Où** : `src/application/auth.ts:205-206` (`login` ne demande le second facteur que si `totpEnabledAt`), `src/application/account.ts:153` (la réinitialisation n'exige un code que pour le TOTP), `src/application/auth.ts:229-233` (`adminNeedsFactor` se contente d'une passkey).
- **Scénario** : un administrateur a ajouté une passkey, comme le propose l'app, mais pas de TOTP. Avec son mot de passe (hameçonnage, fuite), ou avec l'accès à sa boîte mail (lien de réinitialisation sans code), on obtient une session admin complète, puis la sauvegarde de la base entière (F2). **Vérifié dynamiquement** : admin avec passkey et sans TOTP, `loginAction` avec le seul mot de passe → `303 Location: /donnees` et `Set-Cookie: lamal_session=…`.
- **Correctif minimal** : dans `login()`, pour un compte `ADMIN` sans TOTP, refuser l'ouverture par mot de passe (« connectez-vous avec votre passkey »), ou enchaîner une étape passkey obligatoire comme l'étape TOTP. Même règle dans `resetPassword` : un admin sans TOTP ne réinitialise pas par courriel. Plus largement, on peut exiger le second facteur pour tout compte qui a une passkey et se connecte par mot de passe.

### F2 — moyenne — `/api/backup` : ni second facteur, ni confirmation récente, ni journal, ni `no-store` (ASVS 4.3.1, 3.7.1, 8.2.1, 7.1.x)

- **Où** : `src/app/api/backup/route.ts:15-17` (seul `scope.admin` est testé). Le proxy laisse passer `/api/*` sans le contrôle `adminNeedsFactor` (`src/proxy.ts:63`). La réponse (l.32-38) n'a pas de `Cache-Control`.
- **Scénario** : session admin volée (appareil partagé, F1), ou admin qui n'a pas encore ajouté de facteur. Un simple GET télécharge la base de tous les foyers : données de santé, hachages de mots de passe, empreintes de session, adresses. Rien n'est inscrit au journal. **Vérifié** : admin sans facteur → `/admin` redirige vers `/compte?requis=1`, mais `/api/backup` répond `200` avec la base (315 Ko) et sans en-tête de cache.
- **Correctif minimal** : utiliser l'équivalent de `requireAdminScope` (facteur exigé) plus `requireConfirmed(db, scope.sessionId, nowIso())` comme pour l'export ; ajouter `audit(..., "BACKUP_DOWNLOADED")` et `Cache-Control: no-store`.

### F3 — moyenne — Redirection ouverte via `next` (tabulation ou saut de ligne) (ASVS 5.1.5)

- **Où** : `src/server/auth.ts:117-120` (`safeNext` : `/^\/(?![/\\])/`), utilisé dans `src/app/login/page.tsx:18-19` (`redirectIfSignedIn(next)`) et `src/app/login/actions.ts:81,102,129`.
- **Scénario** : lien `https://app/login?next=/%09/evil.example/`. L'utilisateur déjà connecté est redirigé tout de suite, les autres après la connexion. Le navigateur retire la tabulation de `Location: /\t/evil.example`, ce qui donne `//evil.example`, d'où une page d'hameçonnage servie depuis un lien du vrai domaine (« session expirée, retapez votre mot de passe »). **Vérifié** : `GET /login?next=/%09/evil.com` avec session → `307 location: /\t/evil.com` ; `loginAction` avec `next="/\t/evil.example/…"` → `303 Location: /^I/evil.example/…`. Et `new URL("/\t/evil.com", base)` vaut bien `https://evil.com/`.
- **Correctif minimal** : `safeNext` refuse tout caractère de contrôle ou espace (`/[\u0000-\u001F\u007F\s\\]/`) et ne garde que `^\/(?!\/)` ; plus robuste encore, valider avec `new URL(s, "http://x").origin === "http://x"` et renvoyer `pathname+search+hash`.

### F4 — moyenne — Force brute du code TOTP : pas de compteur par compte (ASVS 2.2.1, 2.8.x)

- **Où** :
  - Connexion : `src/application/mfa.ts:150-160`. Le jeton d'étape autorise 5 essais, mais chaque mot de passe correct en recrée un, et `attemptLogin` remet `failedLogins` à zéro (`src/application/auth.ts:156-158`). `MFA_FAILED` est journalisé sans verrouiller quoi que ce soit.
  - Réinitialisation : `src/application/account.ts:148-156`. Un code faux n'incrémente rien, et le jeton reste valable 1 h. La seule limite est `reset-ip` à 20/h par IP (`src/app/login/actions.ts:151`).
- **Scénario** :
  - (a) Avec le mot de passe : 10 connexions par 15 min et par courriel (limite en mémoire), soit environ 50 codes par 15 min ou ~4 800 par jour. Avec ~3·10⁻⁶ de chance par essai, cela fait ~35 % de réussite en un mois, sans alerte.
  - (b) Avec la boîte mail et un lien de réinitialisation : les essais ne sont limités que par IP, contournable avec de nombreuses IP (adresses IPv6 d'un /64), ou sans limite si l'app est exposée sans Caddy (F5). Le second facteur tombe dans l'heure.
- **Correctif minimal** : un compteur d'échecs de second facteur par compte, en base (réutiliser `failedLogins`/`lockedUntil` ou un champ dédié), commun à la connexion, à la réinitialisation et à la confirmation. Verrouillage progressif après environ 10 échecs, et courriel au titulaire. Pour la réinitialisation : appeler `countAttempt` sur le jeton (5 essais) et vérifier le code **avant** l'appel HIBP.

### F5 — faible (moyenne si l'app est exposée sans Caddy) — Adresse IP du client falsifiable par `X-Forwarded-For` (ASVS 2.2.1, 11.1.4)

- **Où** : `src/server/accounts.ts:67-71`. Le commentaire affirme que Next ajoute l'adresse de la connexion à la fin de `X-Forwarded-For`. C'est faux : Next ne la pose que si l'en-tête est absent (`req.headers['x-forwarded-for'] ??= socket.remoteAddress`, `node_modules/next/dist/server/base-server.js:612`). L'indice `len-1-hops` a donc un cran de décalage.
- **Scénario** : avec `TRUSTED_PROXY_HOPS=0` (défaut, Pi en accès direct), le client choisit sa clé de limitation. Derrière un mandataire qui *ajoute* au lieu de remplacer (nginx `$proxy_add_x_forwarded_for`) avec `hops=1`, l'entrée retenue est celle que le client a forgée. Toutes les limites par IP tombent (MFA, réinitialisation, inscription, passkey). **Vérifié** : `passkeyLoginOptionsAction`, 31ᵉ appel avec `X-Forwarded-For: 1.2.3.4` → « Trop de tentatives », puis avec `X-Forwarded-For: 9.9.9.9` → défi émis. Avec le `deploy/Caddyfile` (en cours, non commité), Caddy remplace l'en-tête par défaut : l'indice tombe juste parce qu'il est ramené à 0.
- **Correctif minimal** : prendre `parts[parts.length - hops]` quand `hops > 0`. Avec `hops === 0`, ignorer l'en-tête et lire l'adresse du socket, ou exiger un mandataire. Clé par /64 pour l'IPv6. Corriger le commentaire et le README.

### F6 — moyenne (HEAD) / faible (avec les travaux en cours) — `/login/creer` ouvre une session admin sans second facteur, et sans secret si `SETUP_TOKEN` est vide (ASVS 2.5.4, 4.3.1)

- **Où** : `src/app/login/actions.ts:25-49`. `createPasswordAction` appelle `completeLogin` directement. Le contrôle `setupCodeMatches` (`src/server/accounts.ts`, en cours, non commité) renvoie `true` quand `SETUP_TOKEN` n'est pas défini.
- **Scénario** : la procédure « mot de passe oublié » du README (`UPDATE app_user SET password=… WHERE role='ADMIN'`) laisse un créneau. Pendant ce temps, le premier visiteur de `/login/creer`, par exemple un membre d'un foyer invité, choisit le mot de passe admin et reçoit une session sans TOTP ni passkey, avec accès à la sauvegarde. Même risque au tout premier démarrage d'une instance exposée.
- **Correctif minimal** : rendre `SETUP_TOKEN` obligatoire dès que `APP_URL` est en HTTPS, ou refuser `/login/creer` hors `localhost` sans jeton. Après une redéfinition du mot de passe d'un admin qui a déjà un facteur, renvoyer vers `/login` au lieu d'ouvrir la session.

### F7 — faible — Changements de sécurité non notifiés (ASVS 2.2.3, 2.5.5)

- **Où** :
  - `src/application/auth.ts:210-216` (`changePassword`) : aucun courriel.
  - `src/application/account.ts:100-112` (`confirmEmail`) : l'ancienne adresse n'est pas prévenue d'un changement.
  - `src/application/mfa.ts:103-114` (`disableTotp`) et `src/application/passkeys.ts` (ajout l.57-95, retrait l.174-182) : seulement le journal.
- **Scénario** : un attaquant avec une session et le mot de passe change le courriel ou coupe le TOTP. Le titulaire n'en sait rien et perd la récupération du compte.
- **Correctif minimal** : un courriel à l'adresse *actuelle* (l'ancienne pour un changement de courriel) sur chacun de ces événements. Le patron `passwordResetDoneMail` existe déjà.

### F8 — faible — Le lien de confirmation de courriel ouvre une session pendant 24 h (ASVS 2.7.2, 2.5.x)

- **Où** : `src/app/inscription/actions.ts:36-47` (`confirmEmailAction` → `completeLogin`) ; `src/application/account.ts:19` (`VERIFY_HOURS = 24`). Cela vaut aussi pour un **changement** de courriel (`account.ts:183`).
- **Scénario** : quiconque intercepte le lien (boîte partagée, transfert) dans les 24 h obtient une session sur un compte sans facteur fort, sans mot de passe.
- **Correctif minimal** : ne pas ouvrir de session pour un changement de courriel (un compte déjà confirmé), ou limiter l'ouverture automatique aux 10 premières minutes ; sinon, rediriger vers `/login?confirme=1`.

### F9 — faible — Énumération des comptes par le message de verrouillage (ASVS 2.2.1)

- **Où** : `src/application/auth.ts:195-202` et `src/app/login/actions.ts` (cas `refused`). Un courriel inconnu ne produit jamais `lockedSeconds > 0`, alors qu'un courriel existant affiche « Trop d'essais : réessayez dans N minute(s) » après 5 échecs. La limite par courriel affiche un autre texte, « Trop de tentatives… quelques minutes », après 10.
- **Scénario** : 5 essais suffisent pour savoir si une adresse a un compte (données de santé implicites : la personne utilise l'app LAMal).
- **Correctif minimal** : même message et même durée pour un compte verrouillé et pour un refus ordinaire, ou simuler un verrou pour les courriels inconnus (compteur en mémoire).

### F10 — faible — Verrouillage ciblé d'un compte (déni de service)

- **Où** : `src/app/login/actions.ts:59` (`login-email`, 10 par 15 min, toutes IP confondues) et `src/application/auth.ts:163-167` (verrou en base qui grimpe jusqu'à 30 min).
- **Scénario** : n'importe qui peut empêcher en continu la connexion par mot de passe d'une adresse connue (la passkey reste utilisable).
- **Correctif minimal** : clé de limitation `courriel+IP` pour la limite stricte, avec une limite globale par courriel plus haute ; garder le verrou en base. C'est un compromis à documenter.

### F11 — faible — Codes de secours sous les 112 bits et hachés sans sel (ASVS 2.6.2, L2)

- **Où** : `src/application/mfa.ts:35-39` (10 caractères sur 31, environ 49,5 bits, avec un léger biais de modulo `b % 31`) et l.52 (`digest` SHA-256 sans sel).
- **Scénario** : une copie de la base (sauvegarde, F2) permet de retrouver les codes hors ligne en quelques heures de GPU, puis de passer le second facteur avec le mot de passe.
- **Correctif minimal** : 16 caractères ou plus (environ 80 bits) et un hachage salé (HMAC avec une clé dérivée de la clé maître, ou scrypt léger) ; tirage sans biais (`crypto.randomInt`).

### F12 — faible — Durées de session au-delà du niveau 2 (ASVS 3.3.2 L2)

- **Où** : `src/application/auth.ts:20-22` (30 jours d'inactivité, 90 jours au plus).
- **Écart** : ASVS L2 demande 12 h, ou 30 min d'inactivité. C'est en partie compensé par `requireConfirmed` (10 min) sur l'export et les suppressions, mais ni l'admin ni la sauvegarde n'en profitent (F2).
- **Correctif minimal** : sessions admin courtes (par exemple 12 h, ou 30 min d'inactivité) ; pour les autres, documenter le choix PWA.

### F13 — faible — Cookie sans préfixe accepté en HTTPS (ASVS 3.4.4)

- **Où** : `src/proxy.ts:12,60` et `src/server/accounts.ts:106-114`, qui lisent `__Host-lamal_session` **puis** `lamal_session`.
- **Scénario** : la protection du préfixe `__Host-` est affaiblie. Un cookie `lamal_session` posé par un sous-domaine ou en HTTP (cookie tossing) est accepté quand le cookie préfixé manque, ce qui permet une fixation sur le compte de l'attaquant. Il faut une position réseau ou un sous-domaine compromis ; HSTS `includeSubDomains` (deploy, en cours) réduit le risque.
- **Correctif minimal** : si la requête est en HTTPS, ne lire que le nom `__Host-…`.

### F14 — faible — Messages d'erreur internes renvoyés à l'utilisateur (ASVS 7.4.1)

- **Où** :
  - `src/app/actions/household.ts:301` (`applyPolicyImportAction` renvoie `e.message` pour toute `Error`, y compris les erreurs SQLite comme « NOT NULL constraint failed: … »).
  - `src/app/actions/data.ts:133` (erreur brute enveloppée dans une `UserError`).
  - `src/app/actions/review.ts:327` et `src/infrastructure/pingen/client.ts:102-113` : jusqu'à 300 caractères du corps de réponse Pingen montrés à tout foyer autorisé.
- **Correctif minimal** : ne renvoyer que `UserError` / `NotFoundError` ; pour le reste, un message générique et le détail dans le journal serveur.

### F15 — faible — Trous dans le journal d'audit (ASVS 7.1.3, 7.2.x)

- **Où** : pas d'événement pour le téléchargement de la sauvegarde (`api/backup`), `setPingenAllowed` (`src/application/admin.ts:89-97`), `revokeInvitation` (`src/application/invitations.ts:96-101`) ni `markFeedback` (`src/application/feedback.ts:70-74`).
- **Correctif minimal** : `audit(...)` sur ces actions d'administration.

### F16 — faible — Déni de service applicatif par un compte authentifié (ASVS 12.1.x, 11.1.4)

- **Où** :
  - `src/app/actions/household.ts:238-249`. Un PDF de 20 Mo est analysé par pdf.js dans le processus principal, sans délai maximal ni limite de pages. Cette action est ouverte à tout compte, y compris au milieu de l'accueil.
  - `src/app/actions/data.ts:30-35`. Tout compte lance un import d'archive OFSP (jusqu'à 300 Mo téléchargés, `source.ts:149`) et occupe l'unique créneau d'import.
- **Correctif minimal** : limite de débit par compte sur ces deux actions ; analyse PDF dans un `worker_thread` avec délai maximal et plafond de pages ; `importYearAction` limité à une année absente par heure et par compte.

### F17 — faible — Coût scrypt sous la recommandation OWASP

- **Où** : `src/application/auth.ts:32` (`N = 2^15, r = 8, p = 1`). OWASP recommande `N ≥ 2^17`. Le coût est enregistré avec chaque hachage, donc on peut le relever à la connexion.
- **Correctif minimal** : passer à 2^16 ou 2^17 si la mémoire du Pi et du VPS le permet (`maxmem` à ajuster) et ré-hacher à la connexion.

---

## À vérifier (doutes non confirmés, pas des constats)

1. **`tailscale serve`** (README, accès au Pi) : pose-t-il `X-Forwarded-Proto: https` ? Sinon, les cookies partent sans `Secure` ni préfixe `__Host-` (`isSecureRequest`, `src/server/accounts.ts:98`). Écrase-t-il `X-Forwarded-For` ou y ajoute-t-il (F5) ?
2. **CSP à nonce (en cours, non commité)** : les pages pré-rendues statiquement (`/conditions`, `/confidentialite`, `/mentions-legales`, `/presentation`, `offline.html`) ne reçoivent pas de nonce. Leurs scripts Next seraient bloqués par `'strict-dynamic'`. À tester sur le build avant de commiter. Les réponses des routes `/api/*` et les redirections n'ont pas la CSP complète, ce qui est acceptable.
3. **Journaux SMTP** : les messages d'erreur de nodemailer (`[courriel] …`, `src/server/auth.ts:93`, `src/application/reminders.ts:74`, `src/application/feedback.ts:43`) peuvent contenir l'adresse du destinataire (« recipient rejected <…> »). C'est une donnée personnelle, pas une donnée de santé.
4. **URL CKAN** : `pickPremiumResource` et `pickArchiveResources` (`src/infrastructure/ofsp/source.ts:49-92`) acceptent n'importe quel hôte renvoyé par opendata.swiss, et `fetch` suit les redirections. On fait confiance au catalogue servi en HTTPS ; une liste d'hôtes autorisés (`*.admin.ch`, `opendata.bagnet.ch`) ne coûterait rien.
5. **xlsx en flux** (`exceljs` `WorkbookReader`) : aucun plafond sur la taille décompressée. C'est limité à l'admin et à la source officielle. `adm-zip` 0.6.1 plafonne `inflateRawSync` à la taille annoncée, et `MAX_ENTRY_BYTES` vaut 300 Mo, mais 300 Mo en mémoire pour un conteneur de 768 Mo (deploy) est limite.
6. **`bodySizeLimit: "25mb"`** pour **toutes** les server actions (`next.config.ts:22`) : plusieurs envois simultanés de 25 Mo par des comptes authentifiés pèsent sur le Pi.
7. **Création concurrente de foyer** : `createHouseholdFor` (`src/application/scope.ts:51-58`) teste `scope.householdId === null` hors transaction, et la clé primaire `household_member(household_id, user_id)` n'empêche pas un compte d'avoir deux foyers. Je n'y vois pas de fuite entre foyers, mais c'est un état incohérent possible.
8. **Pages hors ligne** : `ClearCaches` (`src/app/login/page.tsx:43`) purge le cache à l'affichage de `/login`. Si l'appareil est hors ligne quand la session expire, les dernières pages vues restent consultables dans le cache du service worker. C'est un choix fonctionnel, à documenter.

---

## Tableau ASVS par chapitre

Légende : **OK** · **à corriger** · **NA** (non applicable). Les références sont `fichier:ligne` dans l'arbre actuel.

### V1 Architecture (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 1.4.1 Contrôle d'accès appliqué côté serveur, en un point de confiance | OK | `src/server/auth.ts:37-66` (`requireScope`/`pageScope`) en plus du proxy `src/proxy.ts:60-71` ; `docs/architecture.md` « Cloisonnement » |
| 1.4.4/1.4.5 Un mécanisme unique de cloisonnement des objets | OK | `src/application/scope.ts:60-155` (`owned*`/`find*`), règle ESLint qui interdit Drizzle dans `app/` |
| 1.5.x Sérialisation et données non fiables | OK | zod sur les entrées (`invitations.ts`, `feedback.ts`, `push.ts:48-51`) |
| 1.6.x Gestion des clés | OK | `src/infrastructure/crypto/vault.ts:65-90` (clé maître hors base, `0o600`) |

### V2 Authentification (L1 et L2)

| Exigence | Verdict | Preuve |
|---|---|---|
| 2.1.1/2.1.2 Longueur 12 à 200 | OK | `src/application/auth.ts:71-74` |
| 2.1.7 Mots de passe compromis refusés (HIBP) | OK | `src/application/auth.ts:77-81`, `src/infrastructure/hibp.ts:13-29` |
| 2.1.5/2.1.6 Changement avec le mot de passe actuel | OK | `src/application/auth.ts:210-216` |
| 2.1.9/2.1.10 Pas de règles de composition ni de rotation | OK | `validatePassword` |
| 2.2.1 Anti-automatisation et verrouillage | **à corriger** | F4, F5, F10 ; base saine : `auth.ts:153-169`, `login/actions.ts:58-59,90,151` |
| 2.2.3 Notification des changements | **à corriger** | F7 (nouvel appareil et réinitialisation notifiés : `server/auth.ts:88-94`, `account.ts:160`) |
| 2.3.1 Pas de mot de passe initial imposé | OK / F6 | `createFirstAdmin` ; jeton d'installation facultatif (F6) |
| 2.4.1/2.4.2 Stockage résistant, sel ≥ 32 bits | OK (F17) | scrypt avec sel de 16 octets, `auth.ts:32-42` |
| 2.5.1/2.5.2/2.5.3 Réinitialisation par lien unique, sans indice | OK | `account.ts:115-161`, `tokens.ts:45-50` (usage unique) |
| 2.5.4 Pas de compte par défaut | OK / F6 | |
| 2.5.6 Récupération qui garde le second facteur | **à corriger** | TOTP gardé (`account.ts:153`) mais pas la passkey (F1) |
| 2.5.7 Facteur perdu → procédure admin | OK | README (commandes `docker exec`) |
| 2.6.1/2.6.3 Codes de secours à usage unique | OK | `mfa.ts:127-136` |
| 2.6.2 Entropie et sel des codes de secours (L2) | **à corriger** | F11 |
| 2.7.2 Expiration des liens envoyés par courriel | **à corriger** | réinitialisation 1 h (`account.ts:20`) ; confirmation 24 h qui ouvre une session (F8) |
| 2.7.3/2.7.4 Usage unique, CSPRNG | OK | `tokens.ts:13-34` (256 bits, haché) |
| 2.8.1/2.8.3 TOTP RFC 6238, fenêtre ±1 | OK | `totp.ts` (`verifyTotp`) |
| 2.8.4 TOTP non rejouable | OK | `lastStep`, `mfa.ts:122-125` (synchrone, pas de course) |
| 2.8.5 Rejeu journalisé (L2) | à corriger (mineur) | seul `MFA_FAILED` est journalisé, sans distinguer un rejeu |
| 2.8.6 Révocation du TOTP | OK | `mfa.ts:103-114` |
| 2.9.x / WebAuthn : origine, rpId, défi unique, UV | OK | `passkeys.ts` : `expectedOrigin`/`expectedRPID` (l.72-76, 114-119), `requireUserVerification: true`, défi consommé (`consumeToken`, l.66 et 137), `userVerification: "required"` (l.51, 99) ; rp dérivé d'`APP_URL` (`server/accounts.ts`, `relyingParty`) |
| 2.10.4 Secrets de service hors du code | OK | Pingen et SMTP dans l'environnement (`pingen/client.ts:59-74`), `.dockerignore` exclut `.env*` et `data` |
| 4.3.1 (rappel) MFA de l'administration | **à corriger** | F1, F2 |

### V3 Sessions (L1 et L2)

| Exigence | Verdict | Preuve |
|---|---|---|
| 3.1.1 Jeton jamais dans l'URL | OK | cookie seulement |
| 3.2.1 Nouveau jeton à chaque authentification | OK | `openSession` à chaque `completeLogin` (`server/auth.ts:68-81`) |
| 3.2.2/3.2.4 ≥ 128 bits, CSPRNG | OK | `auth.ts:261` (`randomBytes(32)`), stocké haché (l.251, 264) |
| 3.2.3 Stockage navigateur sûr | OK | cookie HttpOnly |
| 3.3.1 La déconnexion invalide côté serveur | OK | `server/auth.ts:102-105` (`closeSession` supprime la ligne) + purge du cache SW (`login/page.tsx:43`) |
| 3.3.2 Durées d'inactivité et absolue | L1 OK / **L2 à corriger** | 30 j d'inactivité, 90 j au plus (`auth.ts:20-22,283-301`) ; F12 |
| 3.3.3 Fermer les autres sessions après un changement d'authentifiant | OK | `changePassword` → `closeOtherSessions` ; `resetPassword` → `closeAllSessions` ; bouton « déconnecter les autres » (`actions/account.ts:52-58`) |
| 3.3.4 Voir les sessions actives | OK | `listSessions` (`auth.ts:359-367`) |
| 3.4.1 Secure | OK (si le mandataire pose `X-Forwarded-Proto`) | `server/accounts.ts:98,117-119` ; voir « À vérifier » n° 1 |
| 3.4.2 HttpOnly / 3.4.3 SameSite | OK | `sameSite: "lax"`, `httpOnly: true` |
| 3.4.4 Préfixe `__Host-` | **à corriger** (mineur) | F13 |
| 3.4.5 Path | OK | `path: "/"` |
| 3.5.x Jetons sans état (JWT) | NA | |
| 3.7.1 Réauthentification avant une action sensible | **à corriger** | export et suppressions OK (`data-rights.ts:137-142,202-204`, `actions/data-rights.ts:65`) ; courriel, mot de passe, TOTP et passkey demandent le mot de passe ; **sauvegarde : non** (F2) |
| Suspension du compte → sessions fermées | OK | `admin.ts:61-69` (`closeAllSessions`), `touchSession` refuse `disabledAt` (`auth.ts:291`) |

### V4 Contrôle d'accès (L1 et L2)

| Exigence | Verdict | Preuve |
|---|---|---|
| 4.1.1 Contrôle côté serveur | OK | toutes les server actions appellent `requireScope`/`requireAdminScope` en tête (vérifié : `actions/account.ts`, `admin.ts`, `data-rights.ts`, `data.ts`, `feedback.ts`, `household.ts`, `journey.ts`, `members.ts`, `review.ts`) ; `logoutAction` sans scope, ce qui est sans risque |
| 4.1.2 Attributs non manipulables | OK | foyer et rôle tirés de la session (`scope.ts:22-27`), jamais du formulaire |
| 4.1.3 Moindre privilège | OK | `requireOwner` (`scope.ts:45-48`) pour inviter, retirer, effacer ; `requireAdmin` pour le référentiel |
| 4.1.5 Échec sûr | OK | `NotFoundError` identique, que l'objet n'existe pas ou appartienne à un autre foyer |
| 4.2.1 IDOR et cloisonnement des foyers | OK | `owned*` dans `household.ts` (savePolicy l.165-169, saveLca l.193-197, delete*), `review.ts` (`loadLine` → `ownedLine`), `strategy.ts:115-118`, `offers.ts`, `signatures.ts:18,24`, `pingen.ts:50,121`, `tariffs.ts` (`getPerson`), `policy-import.ts:210-233` (via `savePolicy`/`saveLca`), `saveNeeds` (`strategy.ts`, `line.reviewId !== r.id`) ; routes PDF : `letterDocument`/`offerDocument` → `findLetter`/`findOfferRequest` ; `pingenRefreshAction` vérifie `ownedLetter` avant la synchro |
| 4.2.2 CSRF | OK | Next refuse une server action si l'`Origin` diffère de l'hôte (**vérifié** : `Origin: https://evil.example` → 500, journal « does not match `origin` … Aborting ») ; SameSite=Lax ; les routes `/api/*` n'exportent que GET, sans effet de bord (seul l'audit de l'export écrit) |
| 4.3.1 MFA des interfaces d'administration | **à corriger** | F1, F2 |
| 4.3.2 Pas d'indexation de répertoires | OK | Next sans listing ; `.well-known` ne sert que `security.txt` (en cours) |
| 4.3.3 Autorisation renforcée pour les actions à fort impact (L2) | **à corriger** | sauvegarde (F2) |
| Routes sans session | OK | seules `/api/health` (`select 1` plus contrôle de la clé maître, `{ok}`), les fichiers PWA, `.well-known` et les pages d'accès et légales sont publiques (`proxy.ts:11,76`) ; `/api/push`, `/api/import`, `/api/export`, `/api/backup` et les routes PDF exigent une session (proxy, plus `currentScope` dans chaque route, **vérifié** `401` sans cookie) |

### V5 Validation, assainissement, encodage (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 5.1.3/5.1.4 Validation positive | OK | zod (`invitations.ts:25-29`, `feedback.ts:19-23`, `push.ts:48-51`), `chfField` (`server/action.ts:36-46`), regex de signature (`signatures.ts:16-17`) |
| 5.1.5 Redirections vers des destinations autorisées | **à corriger** | F3 ; `next.startsWith("/bienvenue")` (`actions/household.ts:58,89,142`) OK |
| 5.2.x Assainissement HTML | OK | aucun `dangerouslySetInnerHTML` ; React 19 neutralise les `href` en `javascript:` (site de caisse saisi par l'admin) |
| 5.3.4 Requêtes paramétrées | OK | Drizzle ; le seul SQL brut à interpolation est `VACUUM INTO` sur un chemin serveur échappé (`db/client.ts:42`) |
| 5.3.x Injection d'en-têtes | OK | `Content-Disposition` avec un slug filtré (`[^a-z0-9]`) ; un `next` avec `\n` est refusé par Node (500) |
| 5.5.x Désérialisation | OK | `JSON.parse` limité aux réponses Pingen et CKAN |

### V6 Cryptographie stockée (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 6.2.1 Échec sûr | OK | `openForHousehold` → null, `vault.ts:114-125` |
| 6.2.2/6.2.3 Algorithmes et modes approuvés | OK | AES-256-GCM, nonce de 96 bits aléatoire, AAD de contexte (`vault.ts:27-44`) |
| 6.3.1 CSPRNG | OK | `randomBytes` partout (jetons, sessions, invitations) ; codes de secours biaisés (F11) |
| 6.4.x Gestion des secrets | OK | `MASTER_KEY_FILE` (secret Docker) dans `deploy/compose.yml` (en cours) |

### V7 Erreurs et journalisation (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 7.1.1/7.1.2 Pas d'identifiant, de jeton ni de donnée de santé dans les journaux | OK (à vérifier) | `console.*` relus : pas de jeton ni de mot de passe ni de secret Pingen ; voir « À vérifier » n° 3 (adresses dans les erreurs SMTP) |
| 7.1.3/7.2.1/7.2.2 Événements de sécurité journalisés | OK / **à corriger** | `audit_event` : connexion, échec, verrou, MFA, passkey, mot de passe, export, membres ; trous : F15 |
| 7.4.1 Message générique et référence | OK / **à corriger** | `app/error.tsx:34` n'affiche que le `digest` ; mais F14 |

### V8 Protection des données (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 8.2.1 En-têtes anti-cache | OK / **à corriger** | pages dynamiques : `private, no-cache, no-store` (**vérifié**) ; export, lettres et offres en `no-store` (`api/export/route.ts:26`, `letters/[id]/pdf/route.tsx:24`, `offers/[id]/pdf/route.tsx:21`) ; **sauvegarde sans en-tête** (F2) |
| 8.2.2/8.2.3 Données effacées du client après la session | OK | cache du service worker purgé sur `/login` (`ui/service-worker.tsx:18-21`, `login/page.tsx:43`) ; voir « À vérifier » n° 8 |
| 8.3.1 Pas de données sensibles dans l'URL | OK | jetons de courriel en `?t=`, à usage unique, avec `Referrer-Policy: same-origin` |
| 8.3.2 Droits d'accès et d'effacement | OK | `data-rights.ts` (export JSON/PDF, suppression du compte ou du foyer, `secure_delete`) |
| 8.3.4 Données de santé hors des courriels | OK | `feedback.ts:37-43`, `account-mail.ts` |

### V9 Communications (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 9.1.1 TLS pour toute connexion client | OK (déploiement) | Caddy en TLS 1.2/1.3 avec HSTS `max-age=31536000; includeSubDomains` (`deploy/Caddyfile`, en cours) ; Tailscale pour le Pi ; l'app elle-même ne pose pas HSTS |
| 9.2.1 TLS vers l'extérieur | OK | OFSP, CKAN, Pingen, HIBP et push en `https://` ; SMTP en `smtps://` conseillé |

### V10 Code malveillant (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 10.3.2 Intégrité des dépendances | OK | `pnpm install --frozen-lockfile` (`Dockerfile:10`) ; `pnpm audit --prod` : 0 vulnérabilité |
| Images et actions CI épinglées | à améliorer (faible) | `node:22-bookworm-slim` épinglé au tag et non au digest (`Dockerfile:3`) ; actions GitHub en `@v4` (`.github/workflows/*.yml`) |

### V11 Logique métier (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 11.1.1 Étapes dans l'ordre | OK | garde-fou LCA (`domain/review.ts`), lettre Pingen réservée de façon atomique (`pingen.ts:57-62`), invitation consommée dans la transaction (`invitations.ts:127-138`) |
| 11.1.4 Anti-automatisation des fonctions coûteuses | **à corriger** | F5, F16 ; Pingen : envoi réservé aux foyers autorisés (`server/pingen.ts:25-27`) |

### V12 Fichiers et ressources (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 12.1.1 Taille maximale | OK | PDF 20 Mo (`actions/household.ts:235-241`), primes 60 Mo pour l'admin (`actions/data.ts:43-51`), corps limité à 25 Mo (`next.config.ts:22`), Caddy à 30 Mo |
| 12.1.2 Bombe zip | OK (admin seul) | `archive.ts:49-51` plus le plafond d'`adm-zip` ; voir « À vérifier » n° 5 |
| 12.2.1 Type vérifié | OK | en-tête `%PDF-` (`household.ts:243`), extension des fichiers de primes (`data.ts:50`) |
| 12.3.1 Noms de fichiers non fiables | OK | `file.name.replace(/[^\w.-]/g,"_")` plus préfixe d'horodatage (`data.ts:55`) |
| 12.4.1 Stockage hors racine web | OK | `data/uploads`, `data/downloads` supprimés après import (`jobs.ts:46-54`) ; la police PDF reste en mémoire |
| 12.6.1 SSRF | OK | abonnements push : liste d'hôtes et `https` (`push.ts:27-45`) ; URL OFSP et Pingen fixées par la configuration et non par l'utilisateur ; voir « À vérifier » n° 4 |

### V13 API (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 13.1.1 Même encodage et même contrôle | OK | les routes `/api/*` appellent `currentScope` elles-mêmes |
| 13.2.1 Méthodes HTTP | OK | GET seulement (les autres méthodes renvoient 405) |
| 13.2.3 CSRF | OK | voir 4.2.2 |
| 13.2.5 Content-Type | OK | `application/json`, `application/pdf`, `application/vnd.sqlite3` |

### V14 Configuration (L1)

| Exigence | Verdict | Preuve |
|---|---|---|
| 14.1.x Build et déploiement | OK | conteneur sous `USER node` (`Dockerfile:30`) ; `read_only`, `cap_drop: ALL`, `no-new-privileges` (`deploy/compose.yml`, en cours) |
| 14.3.2 Pas de mode debug ni de traces exposées | OK | `NODE_ENV=production`, `poweredByHeader: false` |
| 14.4.1 Content-Type et jeu de caractères | OK | |
| 14.4.3 CSP | à corriger en HEAD / **en cours** | HEAD : `frame-ancestors 'none'` seul ; arbre actuel : CSP à nonce par le proxy (`src/proxy.ts`) plus `object-src`/`base-uri` (`next.config.ts:7-14`), voir « À vérifier » n° 2 |
| 14.4.4 nosniff | OK | `next.config.ts` |
| 14.4.5 HSTS | **en cours** | par Caddy (`deploy/Caddyfile`), absent de l'app et de Tailscale |
| 14.4.6 Referrer-Policy | OK | `same-origin` |
| 14.4.7 Anti-iframe | OK | `frame-ancestors 'none'` et `X-Frame-Options: DENY` |
| Permissions-Policy / COOP | **en cours** | ajoutés dans `next.config.ts` (non commité) |
| 14.5.3 CORS | OK | aucun en-tête CORS, donc même origine |

---

## Résumé des correctifs minimaux (ordre conseillé)

1. **F1** : un admin sans TOTP ne se connecte pas et ne réinitialise pas par mot de passe seul.
2. **F2** : `/api/backup` exige le facteur et une confirmation de moins de 10 min, journalise et envoie `no-store`.
3. **F3** : `safeNext` refuse les caractères de contrôle et les espaces, ou valide l'origine avec `URL`.
4. **F4** : compteur d'échecs de second facteur par compte, en base ; 5 essais par jeton de réinitialisation ; TOTP vérifié avant HIBP.
5. **F6** : `SETUP_TOKEN` obligatoire sur une instance exposée ; pas de session automatique sur `/login/creer` si l'admin a un facteur.
6. **F5** : `clientIp` corrigé (`parts[len - hops]`, socket si `hops = 0`, clé /64 en IPv6).
7. F7 à F17 : notifications, lien de confirmation, messages, journal, codes de secours, durées de session, préfixe du cookie, DoS, scrypt.
