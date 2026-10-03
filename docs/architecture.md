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
  application/     Cas d'usage : foyer, revue annuelle, comparateur, lettres, historique
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
référentiels officiels (`server/reference.ts`) ; suivi des lettres confiées à Pingen (statut, n° de suivi, prix ; notification
en cas de refus).

## Envoi par Pingen

Facultatif, actif seulement si `PINGEN_CLIENT_ID`, `PINGEN_CLIENT_SECRET` et `PINGEN_ORGANISATION_ID` sont définis.
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
