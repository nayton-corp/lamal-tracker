/** Erreur attendue, affichable telle quelle à l'utilisateur. */
export class UserError extends Error {}

/**
 * Objet absent, ou appartenant à un autre foyer : la réponse est la même dans les deux cas,
 * pour ne rien révéler de l'existence des données d'autrui.
 */
export class NotFoundError extends UserError {
  constructor(what = "Élément") {
    super(`${what} introuvable.`);
  }
}
