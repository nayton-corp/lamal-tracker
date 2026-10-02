/** Assureurs LAMal autorisés (numéro OFSP → raison sociale), liste OFSP au 1.1.2026. */
export const KNOWN_INSURERS: Record<number, string> = {
  8: "CSS Kranken-Versicherung AG",
  32: "Aquilana Versicherungen",
  134: "Einsiedler Krankenkasse",
  194: "Sumiswalder Krankenkasse",
  246: "Genossenschaft Krankenkasse Steffisburg",
  290: "CONCORDIA",
  312: "Atupri Gesundheits-versicherung AG",
  343: "Avenir Assurance",
  360: "Krankenkasse Luzerner Hinterland",
  376: "KPT Krankenkasse AG",
  455: "ÖKK Kranken- und Unfallversicherungen AG",
  509: "Vivao Sympany AG",
  780: "Genossenschaft Glarner Krankenversicherung",
  820: "curaulta",
  881: "EGK Grundversicherungen AG",
  923: "Genossenschaft KRANKENKASSE SLKK",
  941: "sodalis gesundheitsgruppe",
  966: "vita surselva",
  1040: "Verein Krankenkasse Visperterminen",
  1113: "Caisse-maladie de la vallée d’Entremont société coopérative",
  1318: "Stiftung Krankenkasse Wädenswil",
  1322: "Krankenkasse Birchmeier",
  1384: "SWICA Krankenversicherung AG",
  1386: "Galenos AG",
  1401: "rhenusana",
  1479: "Mutuel Assurance",
  1507: "AMB Assurances SA",
  1509: "Sanitas Grundversicherungen AG",
  1535: "Philos Assurance",
  1542: "Assura-Basis SA",
  1555: "Visana AG",
  1560: "Agrisano Krankenkasse AG",
  1562: "Helsana Versicherungen AG",
  1568: "sana24 AG",
};

export function insurerName(bag: number): string {
  return KNOWN_INSURERS[bag] ?? `Assureur n° ${bag}`;
}

/** Noms usuels, affichés par défaut (la raison sociale reste utilisée dans les lettres). */
export const SHORT_NAMES: Record<number, string> = {
  8: "CSS", 32: "Aquilana", 134: "Einsiedler", 194: "Sumiswalder", 246: "KK Steffisburg", 290: "Concordia",
  312: "Atupri", 343: "Avenir (Groupe Mutuel)", 360: "KK Luzerner Hinterland", 376: "KPT", 455: "ÖKK", 509: "Sympany",
  780: "Glarner KK", 820: "curaulta", 881: "EGK", 923: "SLKK", 941: "sodalis", 966: "vita surselva",
  1040: "KK Visperterminen", 1113: "CM Vallée d'Entremont", 1318: "KK Wädenswil", 1322: "KK Birchmeier",
  1384: "SWICA", 1386: "Galenos", 1401: "rhenusana", 1479: "Mutuel (Groupe Mutuel)", 1507: "AMB",
  1509: "Sanitas", 1535: "Philos (Groupe Mutuel)", 1542: "Assura", 1555: "Visana", 1560: "Agrisano",
  1562: "Helsana", 1568: "sana24",
};
