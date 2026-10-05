# Sécurité

Ce document résume le modèle de menace de l'app et donne l'**état actuel** des constats de
sécurité. La revue détaillée du 4 octobre 2026 ([revue-asvs.md](revue-asvs.md)) est un instantané
daté : ses références `fichier:ligne` ne sont plus à jour, mais ses explications restent utiles.
Les mécanismes (sessions, chiffrement, cloisonnement) sont décrits dans
[../architecture.md](../architecture.md).

Pour signaler une faille : l'adresse de `CONTACT_EMAIL`, publiée dans `/.well-known/security.txt`.

## Modèle de menace, en bref

**Ce qu'on protège.**

- Des **données de santé implicites** : qui est assuré où, avec quelle franchise et quel modèle,
  les personnes d'un foyer et leurs dates de naissance.
- Les **signatures dessinées** (utilisables sur un courrier) et les **secrets du double facteur**.
- Les **comptes** : mots de passe, sessions, et surtout le compte administrateur, qui peut
  télécharger la base entière.

**Contre qui.**

| Menace | Exemple | Principales défenses |
|---|---|---|
| Attaquant sur Internet | force brute, hameçonnage, redirection ouverte, injection | limitation de débit et verrouillage, second facteur, `safeNext`, CSP à nonce, entrées bornées (Zod) |
| Compte d'un autre foyer | deviner l'identifiant d'une lettre ou d'une personne | `Scope` venu de la session, helpers `owned*`, test d'isolation |
| Session ou boîte mail volée | appareil partagé, lien de courriel intercepté | confirmation d'identité de 10 minutes pour les actions sensibles, lien de confirmation limité, courriels à chaque changement de sécurité |
| Copie de la base volée | sauvegarde égarée, stockage objet | signatures et TOTP chiffrés hors de la base (clé maître), sauvegardes chiffrées par age, mots de passe hachés (scrypt) |
| Fichier hostile | PDF ou fichier de primes piégé | taille limitée à 25 Mo, PDF à 30 pages et 200 000 caractères, sources OFSP limitées aux hôtes officiels |
| Chaîne de fabrication | dépendance vulnérable, secret commité, image modifiée | CI : `pnpm audit`, TruffleHog, Trivy, ZAP passif, Dependabot ; image publiée seulement depuis `main` de ce dépôt |

**Hors périmètre.** Un exploitant malveillant (il détient la clé maître) ; un téléphone
déverrouillé entre de mauvaises mains pendant une session ouverte ; la disponibilité face à une
attaque massive (une seule instance, limites en mémoire).

## État des constats

État au 5 octobre 2026. Gravités et numéros de la [revue](revue-asvs.md).

| # | Gravité | État | Correction |
|---|---|---|---|
| F1 | élevée | corrigé | Un administrateur sans TOTP mais avec passkey ne se connecte plus par mot de passe seul. |
| F2 | moyenne | corrigé | Sauvegarde de la base : second facteur, identité confirmée depuis moins de 10 minutes, journal, `Cache-Control: no-store`. |
| F3 | moyenne | corrigé | `safeNext` refuse caractères de contrôle, espaces et barres obliques inverses, vérifie l'origine, puis refuse un chemin réseau recréé par la normalisation (`/.//site`). |
| F4 | moyenne | corrigé | 10 codes TOTP erronés par compte et par 24 h, toutes étapes confondues ; 5 essais par lien de réinitialisation ; code vérifié avant HIBP. |
| F5 | faible | corrigé | `clientIpFrom` : en-tête ignoré sans mandataire de confiance, IPv6 ramenée au /64. Sans mandataire, plus de limite par « IP » commune sur les passkeys. |
| F6 | moyenne | corrigé | `SETUP_TOKEN` obligatoire dès qu'`APP_URL` est en HTTPS ; pas de session automatique pour un administrateur déjà protégé. |
| F7 | faible | corrigé | Courriel au titulaire à chaque changement de mot de passe, double facteur, codes de secours, passkeys ; l'ancienne adresse est prévenue d'un changement de courriel. |
| F8 | faible | corrigé | Le lien de confirmation n'ouvre une session que pour une première confirmation de moins de 15 minutes, et cette session n'est pas « confirmée » pour les actions sensibles. |
| F9, F10 | faible | accepté | Énumération par le message de verrouillage et blocage ciblé d'une adresse : même mécanisme, compromis assumé. |
| F11 | faible | corrigé | Codes de secours de 16 caractères (environ 79 bits, tirage sans biais), empreinte propre au compte. Les anciens codes de 10 caractères restent valables jusqu'à leur régénération. |
| F12 | faible | accepté | Sessions de 30 jours sans activité (app installée sur le téléphone), compensées par la confirmation d'identité de 10 minutes. |
| F13 | faible | corrigé | En HTTPS, seul le cookie `__Host-` est lu. |
| F14 | faible | en partie | Messages génériques pour l'import de police et les notifications ; les erreurs Pingen restent affichées (foyers autorisés seulement). |
| F15 | faible | corrigé | Journal : autorisation Pingen, révocation d'invitation, suppression d'avis, sauvegarde. |
| F16 | faible | corrigé | Police PDF : 30 pages, 200 000 caractères, 10 analyses par heure et par compte ; import d'une année : 3 par heure, archives dès 2015 pour les années passées seulement. |
| F17 | faible | corrigé | scrypt relevé à 2^16 (64 Mo), avec ré-hachage à la connexion. 2^17 saturerait le conteneur de 768 Mo dès quelques connexions simultanées. |

Corrections hors liste, faites après la revue (voir `git log`, commits « Sécurité : … ») :

- expression régulière de `readAccident` réécrite (déni de service par ReDoS sur une police) ;
- téléchargements OFSP et des référentiels limités aux hôtes officiels en HTTPS, redirections comprises (`isOfficialUrl`) ;
- corps de requête limité à 25 Mo partout (proxy de Next, actions, envoi de fichiers) ;
- clés de limitation de débit de plus de 200 caractères remplacées par leur empreinte ;
- mot de passe redemandé dans *Mon compte* : échecs comptés et verrouillage (`requirePassword`) ;
- courriels « mot de passe oublié » et « déjà inscrit » envoyés sans attendre (pas d'oracle de
  temps) ; erreurs SMTP journalisées sans l'adresse (`logMailError`) ;
- service worker : pages privées oubliées dès le renvoi vers la connexion ;
- textes saisis bornés (200 caractères, listes, dates, réponses connues) ;
- image Docker publiée seulement après un push sur `main` de ce dépôt (pas depuis une PR de fork) ;
- conteneur du Pi en lecture seule, sans privilèges ; fichiers de données en `0600`, dossiers du
  serveur en `0700` ; copies d'avant migration effacées après 30 jours ; `restore-test.sh` ne
  laisse aucune copie déchiffrée, même interrompu.

## Points ouverts

| Point | Risque | Piste |
|---|---|---|
| Taille décompressée d'une archive `.zip` importée à la main | une archive de 25 Mo peut annoncer jusqu'à 300 Mo décompressés (`MAX_ENTRY_BYTES`), lourd pour un conteneur de 512 à 768 Mo. Réservé à l'administrateur. | plafond plus bas, ou lecture en flux de l'entrée |
| Lecture xlsx en flux sans plafond décompressé | idem, source officielle ou administrateur seulement | même piste |
| `tailscale serve` et `X-Forwarded-Proto` | sans cet en-tête, cookies sans préfixe `__Host-` sur le Pi | à vérifier sur une installation réelle |
