/*
 * Le rituel d'automne (« review » dans le code) : chaque année, on compare la nouvelle prime de
 * chaque personne aux offres de l'année suivante, on décide, puis on envoie les courriers.
 *
 *   open.ts       ouvrir le rituel d'une année (une ligne par personne, prime reconduite calculée)
 *   decisions.ts  décider pour une personne : garder, changer de caisse, changer de franchise
 *   view.ts       tout ce qu'affiche la page du rituel (meilleure offre, étapes, totaux)
 *   close.ts      clôturer (les contrats de l'année suivante sont créés), rouvrir, supprimer
 *   lines.ts      outils partagés par ces fichiers (non exportés au-delà du dossier)
 *
 * Les courriers eux-mêmes sont dans ../letters.ts, les demandes d'offres dans ../offers.ts.
 */
export * from "./open";
export * from "./decisions";
export * from "./view";
export * from "./close";
