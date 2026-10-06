import { sql } from "drizzle-orm";
import { DEFAULT_HEALTH_COSTS_RP, DEFAULT_KID_SUBGROUP } from "@/domain/lamal";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/*
 * Quatre familles de tables :
 *  - référentiel OFSP (jeux de tarifs immuables, un par année et par fichier), partagé par tous ;
 *  - comptes (utilisateurs, appartenance à un foyer, sessions) ;
 *  - foyer (personnes, contrats LAMal par année, contrats LCA, réglages) ;
 *  - bilan (revue annuelle, décisions figées, lettres).
 * Toute donnée de foyer se rattache à un `household` (directement, ou par la personne ou la revue).
 * Montants en centimes entiers (*_rp). Dates ISO en texte.
 */

const createdAt = () => text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

/** Réglages globaux de l'instance, une valeur JSON par clé (voir db/settings.ts). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

/** Paramètres légaux d'une année (franchises, quote-part, CO2) : jamais en dur dans le code métier. */
export const lamalParameters = sqliteTable("lamal_parameters", {
  year: integer("year").primaryKey(),
  franchisesAdult: text("franchises_adult", { mode: "json" }).$type<number[]>().notNull(),
  franchisesKid: text("franchises_kid", { mode: "json" }).$type<number[]>().notNull(),
  /** Taux de quote-part en points de base (1000 = 10 %). */
  coinsuranceRateBp: integer("coinsurance_rate_bp").notNull(),
  coinsuranceMaxAdultRp: integer("coinsurance_max_adult_rp").notNull(),
  coinsuranceMaxKidRp: integer("coinsurance_max_kid_rp").notNull(),
  co2AnnualRp: integer("co2_annual_rp"),
  /** Origine du montant CO2 : référentiel officiel (mis à jour seul) ou saisie (jamais écrasée). */
  co2Source: text("co2_source", { enum: ["OFFICIAL", "USER"] }).notNull().default("OFFICIAL"),
  /** Origine du montant CO2, affichée à l'administrateur (« OFEV », « Saisi manuellement »…). */
  sourceNote: text("source_note"),
});

/** Caisse-maladie LAMal (référentiel partagé par tous les foyers). */
export const insurer = sqliteTable("insurer", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Numéro OFSP de la caisse (BAG-Nummer), clé stable entre les fichiers officiels. */
  bagNumber: integer("bag_number").notNull().unique(),
  /** Raison sociale officielle (liste OFSP). */
  name: text("name").notNull(),
  /** Nom usuel affiché (« Helsana ») ; null = raison sociale. */
  displayName: text("display_name"),
  /** Raison sociale française (annuaire OFSP), utilisée dans les lettres. */
  legalNameFr: text("legal_name_fr"),
  /** Adresse du siège selon l'annuaire OFSP, une ligne par ligne d'adresse ; mise à jour seule. */
  officialAddress: text("official_address"),
  /** Adresse de résiliation saisie par l'utilisateur ; prioritaire sur l'adresse officielle. */
  terminationAddress: text("termination_address"),
  /** Date de saisie de `terminationAddress` ; null sans adresse saisie. */
  addressVerifiedAt: text("address_verified_at"),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  /** Groupe de la caisse (annuaire OFSP) : souvent l'assureur des complémentaires LCA. */
  groupName: text("group_name"),
  /** Date de l'annuaire OFSP dont proviennent les coordonnées officielles. */
  directoryDate: text("directory_date"),
});

/** Indicateurs annuels d'une caisse (données de surveillance OFSP), par n° OFSP. */
export const insurerIndicator = sqliteTable(
  "insurer_indicator",
  {
    /** Numéro OFSP de la caisse (lien avec `insurer.bag_number`, sans clé étrangère). */
    bagNumber: integer("bag_number").notNull(),
    year: integer("year").notNull(),
    insured: integer("insured").notNull(),
    premiumPerInsuredRp: integer("premium_per_insured_rp").notNull(),
    benefitsPerInsuredRp: integer("benefits_per_insured_rp"),
    adminPerInsuredRp: integer("admin_per_insured_rp"),
    reservesPerInsuredRp: integer("reserves_per_insured_rp"),
  },
  (t) => [primaryKey({ columns: [t.bagNumber, t.year] })],
);

/**
 * Jeu de primes OFSP : un par fichier importé, immuable. Un seul jeu ACTIVE par année ; un nouveau
 * fichier pour la même année rend l'ancien SUPERSEDED. IMPORTING : import en cours (ou interrompu).
 */
export const tariffDataset = sqliteTable(
  "tariff_dataset",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Année des primes ; null tant que le fichier n'a pas été lu (ou s'il est illisible). */
    year: integer("year"),
    /** D'où vient le fichier : URL de téléchargement ou « fichier : <nom> ». */
    source: text("source").notNull(),
    /** Empreinte du fichier : le même fichier n'est jamais importé deux fois. */
    fileSha256: text("file_sha256").notNull(),
    status: text("status", { enum: ["IMPORTING", "ACTIVE", "SUPERSEDED", "FAILED"] }).notNull(),
    /** Rapport de validation (domain/ofsp/report.ts). */
    report: text("report", { mode: "json" }),
    importedAt: createdAt(),
  },
  (t) => [index("tariff_dataset_year").on(t.year, t.status)],
);

/** Tarif d'une caisse dans un jeu de primes (code OFSP, libellé, famille de modèle). */
export const tariff = sqliteTable(
  "tariff",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    datasetId: integer("dataset_id").notNull().references(() => tariffDataset.id, { onDelete: "cascade" }),
    insurerId: integer("insurer_id").notNull().references(() => insurer.id),
    code: text("code").notNull(),
    label: text("label").notNull(),
    /** Type de tarif tel que lu dans le fichier (« TAR-HMO », « TEL_DIG »…), avant classement en `modelType`. */
    typeRaw: text("type_raw").notNull(),
    modelType: text("model_type", { enum: ["STANDARD", "PRAXIS", "TELMED", "PHARMACY", "FLEX", "OTHER"] }).notNull(),
  },
  (t) => [uniqueIndex("tariff_unique").on(t.datasetId, t.insurerId, t.code)],
);

/** Prime mensuelle officielle d'un tarif pour un profil (lieu, âge, accident, franchise), en centimes. */
export const premium = sqliteTable(
  "premium",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    datasetId: integer("dataset_id").notNull().references(() => tariffDataset.id, { onDelete: "cascade" }),
    tariffId: integer("tariff_id").notNull().references(() => tariff.id, { onDelete: "cascade" }),
    /** Canton de domicile (code à deux lettres). */
    canton: text("canton").notNull(),
    /** Région de primes du canton (0 à 3) : les primes varient selon la commune de domicile. */
    region: integer("region").notNull(),
    ageClass: text("age_class", { enum: ["KID", "YOUNG", "ADULT"] }).notNull(),
    /** Sous-groupe d'âge OFSP : K1…K5 (échelons enfant), J1 (jeune adulte), E1 (adulte). */
    subgroup: text("subgroup").notNull(),
    accident: integer("accident", { mode: "boolean" }).notNull(),
    franchiseChf: integer("franchise_chf").notNull(),
    /** Prime mensuelle brute, en centimes. */
    monthlyRp: integer("monthly_rp").notNull(),
  },
  (t) => [
    uniqueIndex("premium_unique").on(t.tariffId, t.canton, t.region, t.ageClass, t.subgroup, t.accident, t.franchiseChf),
    index("premium_lookup").on(t.datasetId, t.canton, t.region, t.ageClass, t.accident, t.subgroup),
  ],
);

/** Foyer : une adresse, des personnes, des comptes membres. Tout ce que saisit un foyer s'y rattache. */
export const household = sqliteTable("household", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  street: text("street").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  city: text("city").notNull().default(""),
  /** Commune de domicile (déterminante pour la région de primes) et son n° OFS. */
  commune: text("commune").notNull().default(""),
  /** Numéro OFS de la commune (numéro officiel de l'Office fédéral de la statistique). */
  bfsNumber: integer("bfs_number"),
  canton: text("canton").notNull(),
  /** Région de primes de la commune (0 à 3), avec `canton` : détermine les primes du foyer. */
  region: integer("region").notNull(),
  createdAt: createdAt(),
});

/** Personne assurée du foyer (adulte ou enfant) ; n'a pas forcément de compte. */
export const person = sqliteTable("person", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthDate: text("birth_date").notNull(),
  /** Échelon de rabais enfant (K1, K3…) lu sur la police. */
  kidSubgroup: text("kid_subgroup").notNull().default(DEFAULT_KID_SUBGROUP),
  /** Couvert par l'assurance-accidents de l'employeur (≥ 8 h/semaine) : accident exclu. */
  employedAccidentCover: integer("employed_accident_cover", { mode: "boolean" }).notNull().default(false),
  /** Frais de santé annuels attendus (questionnaire des besoins), pour le coût total d'une franchise. */
  healthCostsRp: integer("health_costs_rp").notNull().default(DEFAULT_HEALTH_COSTS_RP),
  /** Modèles d'assurance acceptés par la personne ; vide = tous. */
  allowedModels: text("allowed_models", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  /** Caisses que la personne ne veut pas voir dans le comparateur. */
  excludedInsurerIds: text("excluded_insurer_ids", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
  /** Médecin de famille, à retrouver dans la liste des modèles avec premier recours. */
  doctorName: text("doctor_name"),
  /** Ordre d'affichage dans le foyer (à égalité, par date de naissance). */
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

/** Contrat d'assurance de base d'une personne pour une année (un seul par personne et par année). */
export const lamalPolicy = sqliteTable(
  "lamal_policy",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    personId: integer("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
    coverageYear: integer("coverage_year").notNull(),
    insurerId: integer("insurer_id").notNull().references(() => insurer.id),
    /**
     * Numéro à rappeler dans les courriers à la caisse, malgré son nom : n° d'assuré, sinon n° AVS,
     * sinon n° de police (voir `pickIdentifier` dans domain/policy-import.ts).
     */
    policyNumber: text("policy_number"),
    /** Code du tarif OFSP (sert à retrouver le tarif de renouvellement) ; null si inconnu. */
    tariffCode: text("tariff_code"),
    tariffLabel: text("tariff_label"),
    modelType: text("model_type", { enum: ["STANDARD", "PRAXIS", "TELMED", "PHARMACY", "FLEX", "OTHER"] }).notNull(),
    franchiseChf: integer("franchise_chf").notNull(),
    accident: integer("accident", { mode: "boolean" }).notNull(),
    /** Prime brute mensuelle réellement facturée (police), avant redistribution CO2. */
    billedMonthlyRp: integer("billed_monthly_rp").notNull(),
    /**
     * Domicile au 1er janvier de l'année du contrat (commune, n° OFS, canton, région de primes) :
     * fixe les primes de cette année. Repris de l'adresse du foyer, de la police ou du bilan.
     */
    commune: text("commune").notNull().default(""),
    bfsNumber: integer("bfs_number"),
    canton: text("canton").notNull().default(""),
    region: integer("region").notNull().default(0),
    /**
     * MANUAL : saisi ou importé d'une police ; REVIEW : créé par la clôture d'un bilan (retiré si
     * on le rouvre). OFSP n'est écrit par aucun code actuel.
     */
    source: text("source", { enum: ["MANUAL", "OFSP", "REVIEW"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lamal_policy_person_year").on(t.personId, t.coverageYear)],
);

/** Complémentaire LCA d'une personne : jamais résiliée par l'app, surveillée lors d'un changement de caisse. */
export const lcaPolicy = sqliteTable("lca_policy", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personId: integer("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
  /** Assureur de la complémentaire, en texte libre (souvent une société sœur de la caisse LAMal). */
  insurerName: text("insurer_name").notNull(),
  /** Caisse LAMal du même groupe : la quitter peut faire perdre un rabais sur cette complémentaire. */
  linkedInsurerId: integer("linked_insurer_id").references(() => insurer.id),
  productName: text("product_name").notNull(),
  category: text("category", { enum: ["HOSPITAL", "AMBULATORY", "DENTAL", "OTHER"] }).notNull(),
  /** Famille de garantie (liste fixe, voir domain/lca) ; null pour les saisies anciennes. */
  guarantee: text("guarantee"),
  policyNumber: text("policy_number"),
  monthlyRp: integer("monthly_rp"),
  startDate: text("start_date"),
  /** Fin de la durée minimale du contrat ; `noticeMonths` : délai de résiliation en mois. */
  minTermEnd: text("min_term_end"),
  noticeMonths: integer("notice_months"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
});

/** Correspondance d'un code tarif d'une année à l'autre, confirmée par un foyer (propre à ce foyer). */
export const tariffLineage = sqliteTable(
  "tariff_lineage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
    insurerId: integer("insurer_id").notNull().references(() => insurer.id),
    fromYear: integer("from_year").notNull(),
    fromCode: text("from_code").notNull(),
    toYear: integer("to_year").notNull(),
    toCode: text("to_code").notNull(),
  },
  (t) => [uniqueIndex("lineage_unique").on(t.householdId, t.insurerId, t.fromYear, t.fromCode, t.toYear)],
);

/** Bilan annuel (« review ») d'un foyer pour une année cible : comparer, décider, envoyer les courriers. */
export const review = sqliteTable(
  "review",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
    targetYear: integer("target_year").notNull(),
    /** Jeu de primes de l'année cible ; un bilan ouvert passe au nouveau jeu actif quand il est rafraîchi. */
    datasetId: integer("dataset_id").notNull().references(() => tariffDataset.id),
    /** Seuls OPEN et CLOSED sont écrits ; DECIDED et LETTERS_SENT sont des valeurs historiques. */
    status: text("status", { enum: ["OPEN", "DECIDED", "LETTERS_SENT", "CLOSED"] }).notNull(),
    /** Stratégie choisie pour comparer (économie max, maintien, équilibre) ; null = pas encore choisie. */
    strategy: text("strategy", { enum: ["ECONOMY", "KEEP"] }),
    /** Besoins confirmés (franchise, modèles, consommation) : le comparateur peut s'ouvrir. */
    needsConfirmedAt: text("needs_confirmed_at"),
    createdAt: createdAt(),
    closedAt: text("closed_at"),
  },
  (t) => [uniqueIndex("review_household_year").on(t.householdId, t.targetYear)],
);

/** Ligne de revue : une personne dans un bilan, avec sa prime reconduite et sa décision figée. */
export const reviewLine = sqliteTable(
  "review_line",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reviewId: integer("review_id").notNull().references(() => review.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
    /** Contrat de l'année en cours, point de départ de la comparaison. */
    currentPolicyId: integer("current_policy_id").notNull().references(() => lamalPolicy.id),
    /** Profil de primes de la personne pour l'année cible : classe d'âge, puis `accident` et `subgroup`. */
    targetAgeClass: text("target_age_class", { enum: ["KID", "YOUNG", "ADULT"] }).notNull(),
    accident: integer("accident", { mode: "boolean" }).notNull(),
    subgroup: text("subgroup").notNull(),
    /**
     * Domicile de la personne au 1er janvier de l'année cible : les offres et la prime reconduite
     * en dépendent. Repris de l'adresse du foyer à l'ouverture, modifiable (déménagement).
     */
    commune: text("commune").notNull().default(""),
    bfsNumber: integer("bfs_number"),
    canton: text("canton").notNull().default(""),
    region: integer("region").notNull().default(0),
    /**
     * Fiabilité du tarif de renouvellement retrouvé (domain/renewal.ts) : MATCHED certain, PROBABLE
     * à confirmer, AMBIGUOUS plusieurs candidats, MISSING aucune offre de la caisse actuelle.
     */
    renewalStatus: text("renewal_status", { enum: ["MATCHED", "PROBABLE", "AMBIGUOUS", "MISSING"] }).notNull(),
    /** Tarif reconduit chez la caisse actuelle pour l'année cible (« ce que je paierai sans rien faire »). */
    renewalTariffCode: text("renewal_tariff_code"),
    renewalLabel: text("renewal_label"),
    renewalFranchiseChf: integer("renewal_franchise_chf").notNull(),
    renewalMonthlyRp: integer("renewal_monthly_rp"),
    /** Décision pour la personne (domain/review.ts). Les colonnes `chosen*` figent l'offre choisie. */
    decision: text("decision", { enum: ["UNDECIDED", "KEEP", "SWITCH", "ADJUST"] }).notNull().default("UNDECIDED"),
    chosenInsurerId: integer("chosen_insurer_id").references(() => insurer.id),
    chosenTariffCode: text("chosen_tariff_code"),
    chosenLabel: text("chosen_label"),
    chosenModelType: text("chosen_model_type"),
    chosenFranchiseChf: integer("chosen_franchise_chf"),
    chosenMonthlyRp: integer("chosen_monthly_rp"),
    /** Coût annuel attendu de l'offre choisie au moment de la décision ; null pour « je garde ». */
    chosenTotalRp: integer("chosen_total_rp"),
    decidedAt: text("decided_at"),
    /** Le médecin de la personne figure-t-il dans la liste du nouveau modèle ? (réponse de l'utilisateur) */
    doctorCheck: text("doctor_check", { enum: ["YES", "NO", "UNKNOWN"] }).notNull().default("UNKNOWN"),
    /** Contrôle des complémentaires LCA confirmé : sans lui, pas de lettre de résiliation. */
    lcaAckAt: text("lca_ack_at"),
    /** Affiliation demandée à la nouvelle caisse, puis confirmée par elle (dates). */
    affiliationRequestedAt: text("affiliation_requested_at"),
    affiliationConfirmedAt: text("affiliation_confirmed_at"),
    /** Complémentaires à demander à la nouvelle caisse (clés de domain/lca) ; null = reprendre celles en cours. */
    lcaWishes: text("lca_wishes", { mode: "json" }).$type<string[]>(),
    /** Franchise souhaitée pour comparer ; null = l'app cherche la plus avantageuse. */
    wishFranchiseChf: integer("wish_franchise_chf"),
    /** Modèles acceptés pour ce bilan ; null = préférences de la personne. */
    wishModels: text("wish_models", { mode: "json" }).$type<string[]>(),
  },
  (t) => [uniqueIndex("review_line_person").on(t.reviewId, t.personId)],
);

/** Lettre (courrier postal) à la caisse actuelle : résiliation ou changement de franchise/modèle. */
export const letter = sqliteTable("letter", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reviewId: integer("review_id").notNull().references(() => review.id, { onDelete: "cascade" }),
  insurerId: integer("insurer_id").notNull().references(() => insurer.id),
  kind: text("kind", { enum: ["TERMINATION", "CHANGE"] }).notNull(),
  /** Lignes de revue (personnes) couvertes par la lettre : une lettre par caisse et par type. */
  lineIds: text("line_ids", { mode: "json" }).$type<number[]>().notNull(),
  /** Contenu figé au moment de la génération : la lettre ne change plus après. */
  content: text("content", { mode: "json" }).notNull(),
  generatedAt: createdAt(),
  /** Date d'envoi (AAAA-MM-JJ) ; null = à envoyer. Une lettre envoyée n'est plus régénérée. */
  sentAt: text("sent_at"),
  trackingNumber: text("tracking_number"),
  /** Réception confirmée par la caisse. */
  acknowledgedAt: text("acknowledged_at"),
  /** Envoi confié à Pingen (impression et recommandé) : identifiant de la lettre chez Pingen. */
  pingenLetterId: text("pingen_letter_id"),
  /** Dernier statut connu chez Pingen ; « unknown » si la création n'a pas été confirmée. */
  pingenStatus: text("pingen_status"),
  /** Prix facturé par Pingen, en centimes. */
  pingenPriceRp: integer("pingen_price_rp"),
  pingenCheckedAt: text("pingen_checked_at"),
});

/** Demande d'offre adressée à une nouvelle caisse (contenu figé, comme une lettre). */
export const offerRequest = sqliteTable("offer_request", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reviewId: integer("review_id").notNull().references(() => review.id, { onDelete: "cascade" }),
  insurerId: integer("insurer_id").notNull().references(() => insurer.id),
  /** Lignes de revue (personnes) qui rejoignent cette caisse. */
  lineIds: text("line_ids", { mode: "json" }).$type<number[]>().notNull(),
  content: text("content", { mode: "json" }).notNull(),
  generatedAt: createdAt(),
  sentAt: text("sent_at"),
  /** Réponse de la caisse (confirmation d'affiliation) ; `sentAt` : envoi de la demande. */
  answeredAt: text("answered_at"),
});

/** Signature dessinée à l'écran (PNG en data URL), apposée sur les courriers ; chiffrée par la clé du foyer. */
export const signature = sqliteTable("signature", {
  personId: integer("person_id").primaryKey().references(() => person.id, { onDelete: "cascade" }),
  dataUrl: text("data_url").notNull(),
  createdAt: createdAt(),
});

/** Compte d'un utilisateur. Le mot de passe est conservé haché (scrypt, sel et coût inclus). */
export const appUser = sqliteTable("app_user", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Identifiant de connexion ; facultatif tant que l'instance n'a qu'un compte. */
  email: text("email").unique(),
  password: text("password", { mode: "json" }).$type<{ salt: string; hash: string; cost: number }>().notNull(),
  /** ADMIN : référentiel OFSP, caisses, sauvegarde de la base. USER : son foyer seulement. */
  role: text("role", { enum: ["ADMIN", "USER"] }).notNull().default("USER"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: text("locked_until"),
  /** Courriel confirmé par le lien envoyé ; null tant qu'il ne l'est pas. */
  emailVerifiedAt: text("email_verified_at"),
  /** Secret TOTP (base32) du double facteur, actif dès `totpEnabledAt`. */
  totpSecret: text("totp_secret"),
  totpEnabledAt: text("totp_enabled_at"),
  /** Dernier pas de 30 s accepté : un même code ne sert qu'une fois. */
  totpLastStep: integer("totp_last_step"),
  /** Consentement au traitement de données de santé, donné à l'inscription. */
  consentAt: text("consent_at"),
  /** Compte suspendu par l'administrateur : plus aucune connexion. */
  disabledAt: text("disabled_at"),
  /** Dernière activité (connexion ou visite, au plus une mise à jour par heure). */
  lastActiveAt: text("last_active_at"),
  /** Rappels envoyés avant la suppression d'un compte inactif depuis 24 mois (0, 1 ou 2). */
  inactivityNotices: integer("inactivity_notices").notNull().default(0),
  inactivityNoticeAt: text("inactivity_notice_at"),
  createdAt: createdAt(),
});

/** Appartenance d'un compte à un foyer ; un compte n'a qu'un foyer. */
export const householdMember = sqliteTable(
  "household_member",
  {
    householdId: integer("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => appUser.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["OWNER", "MEMBER"] }).notNull().default("OWNER"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] }), uniqueIndex("household_member_user").on(t.userId)],
);

/** Réglages propres à un foyer (ex. « une personne / foyer »). */
export const householdSetting = sqliteTable(
  "household_setting",
  {
    householdId: integer("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.key] })],
);

/** Session d'un compte : un jeton aléatoire par appareil, révocable. */
export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUser.id, { onDelete: "cascade" }),
  /** Empreinte SHA-256 du jeton : le jeton lui-même ne vit que dans le cookie. */
  tokenHash: text("token_hash").notNull().unique(),
  device: text("device").notNull().default(""),
  createdAt: createdAt(),
  lastSeenAt: text("last_seen_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  expiresAt: text("expires_at").notNull(),
  /** Identité confirmée (mot de passe ou passkey) pour les actions sensibles : export, suppression. */
  confirmedAt: text("confirmed_at"),
});

/** Appareil abonné aux notifications, rattaché au compte qui l'a abonné. */
export const pushSubscription = sqliteTable("push_subscription", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => appUser.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  keys: text("keys", { mode: "json" }).$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: createdAt(),
});

/**
 * Rappels déjà envoyés (push ou courriel), pour ne jamais les envoyer deux fois. Clé préfixée
 * `h<foyer>:` pour un rappel propre à un foyer, `ops:` pour une alerte d'exploitation.
 */
export const notificationLog = sqliteTable(
  "notification_log",
  {
    key: text("key").notNull(),
    sentAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.key] })],
);

/**
 * Jetons à usage unique, conservés hachés : confirmation de courriel, réinitialisation du mot de
 * passe, connexion en attente du double facteur, défi WebAuthn, activation du TOTP.
 */
export const authToken = sqliteTable(
  "auth_token",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => appUser.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["VERIFY_EMAIL", "RESET_PASSWORD", "LOGIN_MFA", "WEBAUTHN", "TOTP_SETUP"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_token_user").on(t.userId, t.kind)],
);

/**
 * Invitation : à créer un compte (administrateur) ou à rejoindre un foyer (propriétaire).
 * Le code n'est montré qu'une fois ; seule son empreinte est gardée.
 */
export const invitation = sqliteTable("invitation", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["SIGNUP", "HOUSEHOLD"] }).notNull(),
  codeHash: text("code_hash").notNull().unique(),
  label: text("label").notNull().default(""),
  createdBy: integer("created_by").references(() => appUser.id, { onDelete: "set null" }),
  householdId: integer("household_id").references(() => household.id, { onDelete: "cascade" }),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: createdAt(),
});

/** Passkey (WebAuthn) d'un compte. */
export const passkey = sqliteTable("passkey", {
  /** Identifiant de l'authentifiant, en base64url. */
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUser.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: text("transports", { mode: "json" }).$type<string[]>(),
  name: text("name").notNull().default(""),
  createdAt: createdAt(),
  lastUsedAt: text("last_used_at"),
});

/** Codes de secours du double facteur, à usage unique, conservés hachés. */
export const recoveryCode = sqliteTable(
  "recovery_code",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => appUser.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: text("used_at"),
  },
  (t) => [index("recovery_code_user").on(t.userId)],
);

/** Appareils déjà connus d'un compte : une connexion depuis un autre déclenche une alerte. */
export const knownDevice = sqliteTable(
  "known_device",
  {
    userId: integer("user_id").notNull().references(() => appUser.id, { onDelete: "cascade" }),
    deviceHash: text("device_hash").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.deviceHash] })],
);

/** Journal de sécurité : connexions, facteurs, invitations. Aucune donnée de santé. */
export const auditEvent = sqliteTable(
  "audit_event",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => appUser.id, { onDelete: "cascade" }),
    householdId: integer("household_id").references(() => household.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("audit_event_user").on(t.userId, t.createdAt)],
);

/**
 * Clé de chiffrement d'un foyer (signatures), elle-même chiffrée par la clé maître qui ne vit
 * jamais dans la base. Supprimée avec le foyer.
 */
export const householdKey = sqliteTable("household_key", {
  householdId: integer("household_id").primaryKey().references(() => household.id, { onDelete: "cascade" }),
  wrappedKey: text("wrapped_key").notNull(),
  createdAt: createdAt(),
});

/** Avis envoyé depuis l'app (problème, idée, autre), lu dans l'administration ; supprimé avec le compte. */
export const feedback = sqliteTable(
  "feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => appUser.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["PROBLEM", "IDEA", "OTHER"] }).notNull(),
    message: text("message").notNull(),
    /** Page d'où l'avis a été écrit, pour situer un problème. */
    page: text("page"),
    readAt: text("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_user").on(t.userId, t.createdAt)],
);

/** Compteurs d'usage agrégés de l'instance (comptes créés, courriers préparés) : jamais par compte ni par foyer. */
export const usageCounter = sqliteTable("usage_counter", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});
