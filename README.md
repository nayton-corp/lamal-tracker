# Primes LAMal

Application web (PWA, mobile d'abord) qui suit les primes d'assurance maladie de base (LAMal)
d'un foyer suisse et guide, chaque automne, la comparaison des caisses et le changement.

Auto-hébergée sur un Raspberry Pi ou un petit serveur suisse, elle accueille plusieurs foyers,
chacun avec ses comptes (inscription sur invitation, passkeys, double facteur).

## Ce qu'elle fait

- **Import automatique des primes officielles** de l'OFSP dès leur publication, fin septembre.
- **Reconduction tacite** : ce que le foyer paiera l'an prochain sans rien faire, personne par
  personne, avec le compte à rebours jusqu'au 30 novembre.
- **Comparateur** classé selon le coût total attendu (prime, franchise et quote-part), réglé par
  une page de préférences (payer le moins possible ou ne rien changer) et portrait de chaque caisse.
- **Rappel LCA** : la résiliation ne vise que l'assurance de base, les complémentaires sont
  rappelées sous chaque lettre.
- **Démarches** : demande d'affiliation, lettre de résiliation PDF signée à l'écran, suivi du
  recommandé (ou envoi par Pingen), rappels avant l'échéance ; le rituel se termine seul quand
  tout est envoyé.
- **Historique** pluriannuel des primes payées et des économies.
- **Import de la police PDF** : personnes, contrats et complémentaires lus sans service externe.

> Outil d'aide à la décision, **pas un conseil en assurance**. Vérifiez toujours les conditions des
> modèles (liste de médecins, Telmed…) auprès de la caisse.

## Par où commencer

- **Utiliser l'app** : [docs/guide-utilisateur.md](docs/guide-utilisateur.md).
- **L'héberger** : chez vous sur un Raspberry Pi,
  [docs/exploitation/raspberry-pi.md](docs/exploitation/raspberry-pi.md) ; pour d'autres foyers sur
  un serveur suisse, [docs/exploitation/serveur-public.md](docs/exploitation/serveur-public.md).
- **Contribuer** : [docs/developpement.md](docs/developpement.md).

Toute la documentation, avec l'ordre de lecture conseillé : [docs/README.md](docs/README.md).

## Démarrage rapide (développement)

Prérequis : Node 22 et pnpm.

```sh
pnpm install
pnpm fixtures   # fichiers de primes synthétiques pour les tests
pnpm dev        # http://localhost:3000 : créez le compte administrateur
pnpm test
```

Au premier lancement, l'app télécharge les primes officielles de l'OFSP (réseau nécessaire). Les
réglages utiles en développement (date figée, courriels en fichiers, tâches de fond coupées) sont
dans [docs/developpement.md](docs/developpement.md).
