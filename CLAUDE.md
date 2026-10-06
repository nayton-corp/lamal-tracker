# CLAUDE.md — Primes LAMal

PWA (Next.js App Router, SQLite/Drizzle) : suivi des primes LAMal de plusieurs foyers et bilan annuel de comparaison/résiliation. Déployée en Docker sur un Raspberry Pi (arm64) ou un serveur suisse.

- Lire [`docs/README.md`](docs/README.md) (index), [`docs/architecture.md`](docs/architecture.md) (couches, requête, Scope, chiffrement) et [`docs/developpement.md`](docs/developpement.md) (lancer, tester, conventions).
- `src/domain` est pur : ESLint y interdit les imports de Next, React, Drizzle, `node:*` et des autres couches. Ne pas y lire l'horloge (`new Date()`, `Date.now()`) : convention, la date est passée en paramètre.
- `src/app` et `src/ui` passent par `src/application` (jamais Drizzle ni `@/infrastructure/db`) ; chaque cas d'usage reçoit `db` et un `Scope`, et retrouve les objets par `owned*`/`find*`.
- Montants en centimes entiers (`*_rp`) ; jamais de float pour de l'argent.
- Paramètres légaux par année dans `lamal_parameters` ; les valeurs de la loi (`LEGAL_DEFAULT_*` dans `src/domain/parameters.ts`) ne servent que de repli. Le code métier reçoit un `LamalParameters`, jamais une constante.
- Toute modification du schéma passe par `pnpm db:generate` (migration versionnée dans `drizzle/`).
- Interface en français, mobile d'abord ; couleur ambre réservée aux alertes LCA.
- Variables d'environnement : une seule référence, [`docs/exploitation/configuration.md`](docs/exploitation/configuration.md).
- Avant de pousser : `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`.
