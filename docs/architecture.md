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
    letter.ts        contenu des lettres et des demandes d'offre (indépendant du rendu)
    lca.ts           familles de garanties complémentaires
    policy-import.ts lecture d'une police (texte du PDF) : personnes, franchise, modèle, montants, complémentaires
    insurer-profile.ts portrait d'une caisse : réserves en mois de primes, frais, évolution des primes
    strategy.ts      stratégies du rituel (économie max, maintien, équilibre), points de solidité d'une caisse,
                     profils de consommation
    ofsp/            lecture d'une ligne OFSP (formats ≤2026 et ≥2027), rapport d'import
  application/     Cas d'usage : foyer, revue annuelle, comparateur, lettres, historique
  infrastructure/  SQLite (Drizzle), import OFSP en flux, rendu PDF, notifications push,
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
  CO2 officiel ou saisi) ; `tariff_lineage`
  (correspondance confirmée d'un code tarif d'une année à l'autre).
- Foyer : `household`, `person`, `lamal_policy` (un contrat par personne et par année, prime
  réellement facturée), `lca_policy`.
- Rituel : `review` (une par année cible, stratégie choisie, besoins confirmés), `review_line`
  (franchise et modèles souhaités), (une par personne, complémentaires à
  demander), `letter`, `offer_request` (demande d'offre à une nouvelle caisse, contenu figé).
- Signature dessinée par personne (`signature`, PNG), apposée sur les PDF au rendu.
- Divers : `settings` (dont le mode « une personne / foyer »), `push_subscription`, `notification_log` (rappels dédoublonnés).

Une modification du schéma : éditer `src/infrastructure/db/schema.ts`, puis `pnpm db:generate`
(migration SQL dans `drizzle/`, appliquée au démarrage).

## Tâches de fond

`src/instrumentation.ts` lance un planificateur horaire : contrôle de la signature HTTP du
fichier OFSP (quotidien du 15.09 au 30.11, hebdomadaire sinon), import en arrière-plan si
le fichier a changé, notification ; rappels J-30, J-14, J-7, J-3, J-1 avant la date d'envoi ; vérification hebdomadaire des
référentiels officiels (`server/reference.ts`).

## Parcours

- `/bienvenue` : accueil de la première connexion (pour qui, adresse, personnes, contrats).
- `/rituel/[année]` : reconduction tacite → `strategie` → `besoins` → `comparer` (onglets par personne)
  → `lca` → `lettres` (démarches, signature) → clôture. L'analyse s'ouvre seule pendant la fenêtre
  du rituel (`ritualWindowOpen`, `ensureReview`).
- OCR : Tesseract dans le navigateur ; ses fichiers sont copiés dans `public/ocr` au build
  (`scripts/copy-ocr-assets.mjs`), aucune photo ne quitte l'appareil.
