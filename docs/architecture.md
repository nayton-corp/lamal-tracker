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
    letter.ts        contenu des lettres (indépendant du rendu)
    ofsp/            lecture d'une ligne OFSP (formats ≤2026 et ≥2027), rapport d'import
  application/     Cas d'usage : foyer, revue annuelle, comparateur, lettres, historique
  infrastructure/  SQLite (Drizzle), import OFSP en flux, rendu PDF, notifications push
  server/          Contexte serveur (horloge Europe/Zurich, tâches d'import, planificateur)
  app/             Pages Next.js (App Router) et server actions
  ui/              Composants d'interface (design system)
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
  (n° OFSP, nom, adresse de résiliation) ; `lamal_parameters` (par année) ; `tariff_lineage`
  (correspondance confirmée d'un code tarif d'une année à l'autre).
- Foyer : `household`, `person`, `lamal_policy` (un contrat par personne et par année, prime
  réellement facturée), `lca_policy`.
- Rituel : `review` (une par année cible), `review_line` (une par personne), `letter`.
- Divers : `settings`, `push_subscription`, `notification_log` (rappels dédoublonnés).

Une modification du schéma : éditer `src/infrastructure/db/schema.ts`, puis `pnpm db:generate`
(migration SQL dans `drizzle/`, appliquée au démarrage).

## Tâches de fond

`src/instrumentation.ts` lance un planificateur horaire : contrôle de la signature HTTP du
fichier OFSP (quotidien du 15.09 au 30.11, hebdomadaire sinon), import en arrière-plan si
le fichier a changé, notification ; rappels J-30, J-14, J-7, J-3, J-1 avant la date d'envoi.
