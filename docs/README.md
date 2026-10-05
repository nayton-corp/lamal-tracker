# Documentation de Primes LAMal

Chaque sujet est traité dans un seul document ; les autres y renvoient. Choisissez votre point
d'entrée selon ce que vous voulez faire.

## Par rôle

| Vous êtes… | Lisez |
|---|---|
| **Utilisateur** : vous gérez l'assurance de votre foyer | [guide-utilisateur.md](guide-utilisateur.md), puis [concepts.md](concepts.md) pour comprendre franchise, quote-part et résiliation |
| **Hébergeur sur un Raspberry Pi** : l'app tourne chez vous | [exploitation/raspberry-pi.md](exploitation/raspberry-pi.md), [exploitation/configuration.md](exploitation/configuration.md), [exploitation/sauvegarde-restauration.md](exploitation/sauvegarde-restauration.md) |
| **Exploitant d'un serveur public** : l'app est ouverte à d'autres foyers | [exploitation/serveur-public.md](exploitation/serveur-public.md), [exploitation/configuration.md](exploitation/configuration.md), [exploitation/sauvegarde-restauration.md](exploitation/sauvegarde-restauration.md), [exploitation/administration.md](exploitation/administration.md), [securite/README.md](securite/README.md) |
| **Développeur** : vous modifiez le code | l'ordre de lecture ci-dessous |

Dans tous les cas d'hébergement : [exploitation/administration.md](exploitation/administration.md)
(invitations, comptes), [exploitation/pingen.md](exploitation/pingen.md) (envoi en recommandé,
facultatif) et [exploitation/mises-a-jour.md](exploitation/mises-a-jour.md) avant une mise à jour
importante.

## Nouveau développeur : ordre de lecture

1. [concepts.md](concepts.md) : l'assurance maladie suisse en quelques pages (prime, franchise,
   quote-part, modèles, LCA, résiliation, données de l'OFSP). Sans ces notions, le code est
   difficile à suivre.
2. [glossaire.md](glossaire.md) : correspondance entre les mots de l'interface (en français) et
   les identifiants du code (en anglais), par exemple rituel et `review`.
3. [architecture.md](architecture.md) : les couches, le chemin d'une requête, le cloisonnement
   des foyers, l'authentification, le chiffrement, les tâches de fond.
4. [modele-de-donnees.md](modele-de-donnees.md) : les tables, leurs relations et leurs états.
5. [developpement.md](developpement.md) : lancer l'app, tester, ajouter une fonctionnalité,
   la CI.

Les règles courtes pour un agent de code sont dans [../CLAUDE.md](../CLAUDE.md).

## Tous les documents

| Document | Contenu |
|---|---|
| [guide-utilisateur.md](guide-utilisateur.md) | Le rituel d'automne pas à pas, le foyer, la police PDF, les démarches, le compte et les données |
| [concepts.md](concepts.md) | Notions LAMal et données officielles |
| [glossaire.md](glossaire.md) | Interface ↔ code ↔ table ou route |
| [architecture.md](architecture.md) | Organisation du code et décisions de conception |
| [modele-de-donnees.md](modele-de-donnees.md) | Tables, relations, états, migrations |
| [developpement.md](developpement.md) | Poste de développement, tests, CLI, conventions, CI |
| [exploitation/configuration.md](exploitation/configuration.md) | Toutes les variables d'environnement |
| [exploitation/raspberry-pi.md](exploitation/raspberry-pi.md) | Installation chez soi, HTTPS avec Tailscale |
| [exploitation/serveur-public.md](exploitation/serveur-public.md) | Serveur suisse : HTTPS, staging, sauvegarde continue, surveillance, mises en production |
| [exploitation/sauvegarde-restauration.md](exploitation/sauvegarde-restauration.md) | Clé maître, copies, restauration, commandes de secours |
| [exploitation/administration.md](exploitation/administration.md) | Invitations, comptes, Pingen par foyer, avis, chiffres d'usage, alertes |
| [exploitation/pingen.md](exploitation/pingen.md) | Mise en place de l'envoi en recommandé |
| [exploitation/mises-a-jour.md](exploitation/mises-a-jour.md) | Notes de mise à jour des instances existantes |
| [securite/README.md](securite/README.md) | Modèle de menace et état des constats |
| [securite/revue-asvs.md](securite/revue-asvs.md) | Revue OWASP ASVS du 4 octobre 2026 (instantané) |
