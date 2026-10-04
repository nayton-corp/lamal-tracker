import "server-only";

/**
 * Exploitant de l'instance, pour les mentions légales et les demandes des utilisateurs
 * (OPERATOR_NAME, OPERATOR_ADDRESS sur plusieurs lignes séparées par « ; », CONTACT_EMAIL).
 */
export function operator() {
  const name = process.env.OPERATOR_NAME?.trim() || null;
  const address = (process.env.OPERATOR_ADDRESS ?? "").split(";").map((l) => l.trim()).filter(Boolean);
  const contact = process.env.CONTACT_EMAIL?.trim() || null;
  return { name, address, contact };
}
