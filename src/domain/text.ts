/** Petits outils de texte : comparer des noms sans tenir compte des accents, fabriquer des noms de fichiers. */

/** « Sénévita » → « Senevita » : retire les accents (décomposition Unicode puis suppression des diacritiques). */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Forme de comparaison : sans accents, en minuscules. */
export function foldForSearch(text: string): string {
  return stripAccents(text).toLowerCase();
}

/** « Groupe Mutuel Assurance GMA SA » → « groupe-mutuel-assurance-gma-sa » (noms de fichiers). */
export function slugify(text: string, maxLength = 40): string {
  return foldForSearch(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength)
    .replace(/-$/, "");
}
