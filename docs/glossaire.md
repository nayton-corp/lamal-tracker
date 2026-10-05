# Glossaire : interface ↔ code

L'interface est en français, le code en anglais. Ce tableau fait la correspondance. Les notions
elles-mêmes sont expliquées dans [concepts.md](concepts.md) ; les tables dans
[modele-de-donnees.md](modele-de-donnees.md).

Les routes sont relatives à `src/app/` (`[year]` = année cible, ex. `/bilan/2027`).

| Terme de l'interface | Identifiant de code | Table | Route |
|---|---|---|---|
| **Foyer et personnes** | | | |
| Foyer | `household`, `src/application/household.ts` | `household` | `/foyer` |
| Mode « une personne » / « foyer » (menu *Moi* ou *Foyer*) | `HouseholdMode` : `SOLO`, `FAMILY` | `household_setting` (clé `mode`) | `/foyer` |
| Accueil guidé | `WelcomePage` | — | `/bienvenue` |
| Carte de l'année, tâches de l'accueil | `yearCardState`, `homeTasks` (`src/domain/home.ts`), `homeOverview` | — | `/` |
| Personne | `person`, `findPerson`, `ownedPerson` | `person` | `/foyer/personne/[id]`, `/foyer/personne/nouvelle` |
| Contrat LAMal | `lamalPolicy`, `ownedPolicy`, `savePolicy` | `lamal_policy` | `/foyer/personne/[id]` |
| Complémentaire (LCA) | `lcaPolicy`, `ownedLca`, `LcaGuarantee` | `lca_policy` | `/foyer/personne/[id]` |
| Importer une police | `src/application/policy-import.ts`, `src/domain/policy-import.ts` | — | `/foyer/importer?personne=[id]` (depuis « Ajouter un contrat ») |
| Signature | `signature`, `src/application/signatures.ts` | `signature` | `/bilan/[year]/lettres` |
| Historique | `householdHistory` (`src/application/history.ts`) | — | `/historique` |
| **Comptes** | | | |
| Compte | `appUser` | `app_user` | `/compte` |
| Administrateur / utilisateur | rôle `ADMIN` / `USER`, `Scope.isAdmin` | `app_user.role` | `/admin` |
| Accès au foyer (propriétaire / membre) | `householdMember`, `Scope.householdRole` : `OWNER` / `MEMBER`, `requireOwner` | `household_member` | `/foyer/comptes` |
| Mon compte | `src/application/account.ts`, `mfa.ts`, `passkeys.ts` | `app_user`, `passkey`, `recovery_code`, `session` | `/compte`, `/compte/passkey` |
| Double facteur, codes de secours | TOTP (`src/application/totp.ts`), `RECOVERY_CODE_COUNT` | `app_user.totp_secret`, `recovery_code` | `/compte`, `/login/code` |
| Mes données | `src/application/data-rights.ts` | — | `/compte/donnees` |
| Invitation | `invitation` (`SIGNUP`, `HOUSEHOLD`) | `invitation` | `/inscription`, `/foyer/comptes`, `/admin` |
| Créer le compte administrateur | `SETUP_TOKEN`, `accountExists` | `app_user` | `/login/creer` |
| Avis | `feedback`, `sendFeedback` | `feedback` | `/avis`, `/admin` |
| En chiffres (administration) | `bumpUsage`, `UsageKey` | `usage_counter` | `/admin` |
| **Référentiel** | | | |
| Caisse | `insurer` | `insurer` | `/donnees/caisses` |
| Portrait de la caisse | `insurerProfiles` (`src/application/insurers.ts`), `src/domain/insurer-profile.ts` | `insurer_indicator` | `/bilan/[year]/personne/[lineId]` |
| Jeu de primes | `tariffDataset` (`IMPORTING`, `ACTIVE`, `SUPERSEDED`, `FAILED`) | `tariff_dataset` | `/donnees` |
| Tarif | `tariff`, `tariffCode` | `tariff` | — |
| Prime | `premium`, `monthlyRp`, `Offer.monthlyPremiumRp` | `premium` | — |
| Paramètres de l'année (franchises, quote-part, CO2) | `LamalParameters`, `parametersFor` | `lamal_parameters` | `/donnees` |
| Redistribution CO2 | `co2AnnualRp` | `lamal_parameters.co2_annual_rp` | `/donnees` |
| Franchise | `franchiseChf` | colonnes `*franchise_chf` | — |
| Quote-part | `coinsurance*` (`coinsuranceRateBp`, `coinsuranceMaxFor`) | `lamal_parameters` | — |
| Classe d'âge | `AgeClass` : `KID`, `YOUNG`, `ADULT` | `premium.age_class` | — |
| Modèle | `ModelType` : `STANDARD`, `PRAXIS`, `TELMED`, `PHARMACY`, `FLEX`, `OTHER` | `*.model_type` | — |
| Région de primes | `region`, `lookupPostalCode` | `household.region` | `/foyer` |
| Réglages | `src/app/donnees/` | `settings` | `/donnees` |
| **Bilan** | | | |
| Bilan | `review`, `findReview`, `ownedReview` | `review` | `/bilan`, `/bilan/[year]` |
| Ligne (une personne du bilan) | `reviewLine`, `findLine`, `ownedLine` | `review_line` | `/bilan/[year]/personne/[lineId]` |
| Hausse, reconduction | `renewal*`, `findRenewal`, `RenewalStatus` | `review_line.renewal_*` | `/bilan/[year]` |
| Correspondance de tarif (lignée) | `tariffLineage`, `confirmLineage` | `tariff_lineage` | `/bilan/[year]/personne/[lineId]` |
| Stratégie : Payer le moins possible / Ne rien changer au quotidien | `Strategy` : `ECONOMY` / `KEEP` | `review.strategy` | `/bilan/[year]/preferences` |
| Préférences (stratégie et besoins) | `savePreferences`, `UsageProfile` | `review.needs_confirmed_at`, `review_line.wish_*` | `/bilan/[year]/preferences` |
| Comparateur | `compareForLine` (`src/application/compare.ts`), `rankForStrategy` | — | `/bilan/[year]/comparer`, `/bilan/[year]/personne/[lineId]` |
| Comparer des offres (côte à côte) | — | — | `/bilan/[year]/personne/[lineId]/comparer` |
| Je garde / Je change de caisse / Je change de franchise ou de modèle | `Decision` : `KEEP` / `SWITCH` / `ADJUST` (`UNDECIDED` = À décider) | `review_line.decision` | `/bilan/[year]/personne/[lineId]` |
| Rappel LCA (complémentaires) | `LcaNote`, `lcaProducts` | `lca_policy` | `/bilan/[year]/lettres` |
| Étapes Hausse → Envoi | `RitualStepKey`, `ritualSteps`, `isRitualComplete` | — | `/bilan/[year]` |
| Clôture automatique / Modifier mes choix / Recommencer à zéro | `syncReviewClosure`, `reopenReview`, `deleteReview` | `review.status` | `/bilan/[year]` |
| Démarches | `src/app/bilan/[year]/lettres/page.tsx` | — | `/bilan/[year]/lettres` |
| Demande d'offre / d'affiliation | `offerRequest`, `ownedOfferRequest` | `offer_request` | `/bilan/[year]/lettres` |
| Lettre : résiliation / changement | `letter`, `ownedLetter`, `kind` : `TERMINATION` / `CHANGE` | `letter` | `/bilan/[year]/lettres` |
| Envoi par Pingen | `src/application/pingen.ts`, `PingenPhase` | `letter.pingen_*` | `/bilan/[year]/lettres` |
| Clôture, réouverture | `closeReview`, `reopenReview`, `deleteReview` | `review.status`, `review.closed_at` | `/bilan/[year]` |
| Rappels | `letterReminders`, `REMINDER_OFFSETS` | `notification_log`, `push_subscription` | `/donnees` (section Rappels) |
| **Termes techniques** | | | |
| Portée d'une requête (compte, foyer, rôles) | `Scope`, `pageScope`, `accountPageScope`, `requireScope`, `requireAdminScope` | — | — |
| Erreur affichable | `UserError`, `NotFoundError` (`src/application/errors.ts`) | — | — |
| Résultat d'une action serveur | `ActionState`, `toActionError` (`src/server/action.ts`) | — | — |
| Date du jour (`AAAA-MM-JJ`) | `IsoDate`, `today()` | colonnes `*_at`, `*_date` (texte) | — |
| Montant en centimes | `Rappen`, suffixe `Rp` / `_rp` (`40_000` = CHF 400.00) | colonnes `*_rp` | — |
| Montant en francs entiers | suffixe `Chf` / `_chf` (franchises) | colonnes `*_chf` | — |
| Taux en points de base | suffixe `Bp` / `_bp` (`1000` = 10 %) | `coinsurance_rate_bp` | — |
| Taux en pour mille | suffixe `Permille` (`changePermille`, `QUALITY_WEIGHT_PERMILLE`) | — | — |
| Numéro OFSP d'une caisse | `bagNumber` (BAG = OFSP en allemand) | `insurer.bag_number` | — |
| Numéro OFS d'une commune | `bfsNumber` (BFS = OFS en allemand) | `household.bfs_number` | — |
