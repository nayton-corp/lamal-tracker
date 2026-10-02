/**
 * Générateur de fichiers de primes au format OFSP (colonnes du fichier opendata.swiss « Prämien_CH »),
 * avec des montants synthétiques déterministes. Sert aux tests et à la démo.
 */
export interface FixtureInsurer {
  id: number;
  products: { code: string; type: "TAR-BASE" | "TAR-HAM" | "TAR-HMO" | "TAR-DIV"; label: string; factor: number }[];
  /** Niveau de prime relatif de l'assureur. */
  level: number;
}

export const FIXTURE_INSURERS: FixtureInsurer[] = [
  {
    id: 8,
    level: 1.0,
    products: [
      { code: "BASE", type: "TAR-BASE", label: "Standard", factor: 1 },
      { code: "HAM-CASA", type: "TAR-HAM", label: "Casamed Hausarzt", factor: 0.88 },
      { code: "TEL-MED", type: "TAR-DIV", label: "Multimed Telmed", factor: 0.84 },
    ],
  },
  {
    id: 1542,
    level: 0.9,
    products: [
      { code: "BASIS", type: "TAR-BASE", label: "Basis", factor: 1 },
      { code: "PHARMED", type: "TAR-DIV", label: "PharMed Apothekenmodell", factor: 0.86 },
    ],
  },
  {
    id: 1384,
    level: 1.05,
    products: [
      { code: "OPTIMED", type: "TAR-BASE", label: "Optimed Standard", factor: 1 },
      { code: "FAVORIT", type: "TAR-HMO", label: "Favorit Gesundheitszentrum", factor: 0.8 },
    ],
  },
  {
    id: 1509,
    level: 0.97,
    products: [
      { code: "BASIC", type: "TAR-BASE", label: "Basic", factor: 1 },
      { code: "CALLMED", type: "TAR-DIV", label: "CallMed", factor: 0.85 },
    ],
  },
];

const ADULT_FRANCHISES = [300, 500, 1000, 1500, 2000, 2500];
const KID_FRANCHISES = [0, 100, 200, 300, 400, 500, 600];

export interface FixtureOptions {
  year: number;
  cantons?: { canton: string; regions: number[]; level: number }[];
  insurers?: FixtureInsurer[];
  /** Hausse globale par rapport à la base (1.06 = +6 %). */
  inflation?: number;
  /** Écrase le code d'un produit (simule un renommage d'une année à l'autre). */
  renames?: Record<string, string>;
  delimiter?: string;
  /** En-têtes français (autre variante de format) */
  french?: boolean;
}

function premium(base: number, franchise: number, isKid: boolean): number {
  // Rabais de franchise approximatif (70 % de la différence de franchise, réparti sur 12 mois).
  const min = isKid ? 0 : 300;
  return Math.max(base - ((franchise - min) * 0.7) / 12, base * 0.45);
}

export function buildOfspCsv(options: FixtureOptions): string {
  const {
    year,
    cantons = [
      { canton: "VD", regions: [1, 2], level: 1.0 },
      { canton: "GE", regions: [0], level: 1.12 },
    ],
    insurers = FIXTURE_INSURERS,
    inflation = 1,
    renames = {},
    delimiter = ";",
    french = false,
  } = options;
  const header = french
    ? [
        "Assureur",
        "Canton",
        "Région",
        "Classe d'âge",
        "Accident",
        "Année",
        "Tarif",
        "Type de tarif",
        "Sous-groupe d'âge",
        "Franchise",
        "Prime",
        "Désignation du tarif",
      ]
    : [
        "Versicherer",
        "Kanton",
        "Region",
        "Altersklasse",
        "Unfalleinschluss",
        "Geschäftsjahr",
        "Erhebungsjahr",
        "Tarif",
        "Tariftyp",
        "Altersuntergruppe",
        "Franchisestufe",
        "Franchise",
        "Prämie",
        "isBaseP",
        "isBaseF",
        "isBaseAG",
        "Tarifbezeichnung",
        "Sort",
      ];
  const lines = [header.join(delimiter)];
  const classes = [
    { code: "AKL-KIN", base: 120, kid: true, subgroups: ["K1", "K2"] },
    { code: "AKL-JUG", base: 380, kid: false, subgroups: [""] },
    { code: "AKL-ERW", base: 470, kid: false, subgroups: [""] },
  ];
  let sort = 0;
  for (const c of cantons) {
    for (const region of c.regions) {
      for (const ins of insurers) {
        for (const product of ins.products) {
          const code = renames[`${ins.id}:${product.code}`] ?? product.code;
          for (const cls of classes) {
            for (const sub of cls.subgroups) {
              for (const accident of ["OHN-UNF", "MIT-UNF"]) {
                const franchises = cls.kid ? KID_FRANCHISES : ADULT_FRANCHISES;
                franchises.forEach((f, i) => {
                  const regionFactor = 1 - region * 0.06;
                  const subFactor = sub === "K2" ? 0.75 : 1;
                  const accidentFactor = accident === "MIT-UNF" ? 1.08 : 1;
                  const base = cls.base * c.level * ins.level * product.factor * regionFactor * subFactor * accidentFactor * inflation;
                  const value = premium(base, f, cls.kid).toFixed(2);
                  sort += 1;
                  const row = french
                    ? [
                        String(ins.id),
                        c.canton,
                        `PR-REG CH${region}`,
                        cls.kid ? "Enfants" : cls.code === "AKL-JUG" ? "Jeunes adultes" : "Adultes",
                        accident === "MIT-UNF" ? "avec accident" : "sans accident",
                        String(year),
                        code,
                        product.type,
                        sub,
                        String(f),
                        value.replace(".", ","),
                        product.label,
                      ]
                    : [
                        String(ins.id).padStart(4, "0"),
                        c.canton,
                        `PR-REG CH${region}`,
                        cls.code,
                        accident,
                        String(year),
                        String(year - 1),
                        code,
                        product.type,
                        sub,
                        `FRAST${i + 1}`,
                        `FRA-${f}`,
                        value,
                        product.type === "TAR-BASE" ? "1" : "0",
                        i === 0 ? "1" : "0",
                        "1",
                        product.label,
                        String(sort),
                      ];
                  lines.push(row.map((v) => (v.includes(delimiter) || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(delimiter));
                });
              }
            }
          }
        }
      }
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function fixtureBytes(options: FixtureOptions, encoding: "utf-8" | "utf-8-bom" = "utf-8-bom"): Uint8Array {
  const text = buildOfspCsv(options);
  const bytes = new TextEncoder().encode(text);
  if (encoding === "utf-8") return bytes;
  const withBom = new Uint8Array(bytes.length + 3);
  withBom.set([0xef, 0xbb, 0xbf]);
  withBom.set(bytes, 3);
  return withBom;
}
