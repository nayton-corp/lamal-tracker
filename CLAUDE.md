# CLAUDE.md — Primes LAMal

PWA personnelle (Next.js App Router, SQLite/Drizzle) : suivi des primes LAMal d'un foyer et rituel annuel de comparaison/résiliation. Déployée en Docker sur un Raspberry Pi (arm64).

- Lire [`README.md`](README.md) (usage, déploiement) et [`docs/architecture.md`](docs/architecture.md) (couches, principes).
- `src/domain` est pur : pas d'import de Next, Drizzle, Node ni de l'horloge (ESLint l'impose).
- Montants en centimes entiers (`*_rp`) ; jamais de float pour de l'argent.
- Paramètres légaux par année (`lamal_parameters`), jamais en dur dans le code métier.
- Toute modification du schéma passe par `pnpm db:generate` (migration versionnée dans `drizzle/`).
- Interface en français, mobile d'abord ; couleur ambre réservée aux alertes LCA.
- Avant de pousser : `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`.
