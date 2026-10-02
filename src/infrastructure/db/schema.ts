import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/*
 * Trois familles de tables :
 *  - référentiel OFSP (jeux de tarifs immuables, un par année et par fichier) ;
 *  - foyer (personnes, contrats LAMal par année, contrats LCA) ;
 *  - rituel (revue annuelle, décisions figées, lettres).
 * Montants en centimes entiers (*_rp). Dates ISO en texte.
 */

const createdAt = () => text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const lamalParameters = sqliteTable("lamal_parameters", {
  year: integer("year").primaryKey(),
  franchisesAdult: text("franchises_adult", { mode: "json" }).$type<number[]>().notNull(),
  franchisesKid: text("franchises_kid", { mode: "json" }).$type<number[]>().notNull(),
  coinsuranceRateBp: integer("coinsurance_rate_bp").notNull(),
  coinsuranceMaxAdultRp: integer("coinsurance_max_adult_rp").notNull(),
  coinsuranceMaxKidRp: integer("coinsurance_max_kid_rp").notNull(),
  co2AnnualRp: integer("co2_annual_rp"),
  /** Origine du montant CO2 : référentiel officiel (mis à jour seul) ou saisie (jamais écrasée). */
  co2Source: text("co2_source", { enum: ["OFFICIAL", "USER"] }).notNull().default("OFFICIAL"),
  sourceNote: text("source_note"),
});

export const insurer = sqliteTable("insurer", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bagNumber: integer("bag_number").notNull().unique(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  /** Raison sociale française (annuaire OFSP), utilisée dans les lettres. */
  legalNameFr: text("legal_name_fr"),
  /** Adresse du siège selon l'annuaire OFSP, une ligne par ligne d'adresse ; mise à jour seule. */
  officialAddress: text("official_address"),
  /** Adresse de résiliation saisie par l'utilisateur ; prioritaire sur l'adresse officielle. */
  terminationAddress: text("termination_address"),
  addressVerifiedAt: text("address_verified_at"),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),
  groupName: text("group_name"),
  /** Date de l'annuaire OFSP dont proviennent les coordonnées officielles. */
  directoryDate: text("directory_date"),
});

/** Indicateurs annuels d'une caisse (données de surveillance OFSP), par n° OFSP. */
export const insurerIndicator = sqliteTable(
  "insurer_indicator",
  {
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

export const tariffDataset = sqliteTable(
  "tariff_dataset",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: integer("year"),
    source: text("source").notNull(),
    fileSha256: text("file_sha256").notNull(),
    status: text("status", { enum: ["IMPORTING", "ACTIVE", "SUPERSEDED", "FAILED"] }).notNull(),
    report: text("report", { mode: "json" }),
    importedAt: createdAt(),
  },
  (t) => [index("tariff_dataset_year").on(t.year, t.status)],
);

export const tariff = sqliteTable(
  "tariff",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    datasetId: integer("dataset_id").notNull().references(() => tariffDataset.id, { onDelete: "cascade" }),
    insurerId: integer("insurer_id").notNull().references(() => insurer.id),
    code: text("code").notNull(),
    label: text("label").notNull(),
    typeRaw: text("type_raw").notNull(),
    modelType: text("model_type", { enum: ["STANDARD", "PRAXIS", "TELMED", "PHARMACY", "FLEX", "OTHER"] }).notNull(),
  },
  (t) => [uniqueIndex("tariff_unique").on(t.datasetId, t.insurerId, t.code)],
);

export const premium = sqliteTable(
  "premium",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    datasetId: integer("dataset_id").notNull().references(() => tariffDataset.id, { onDelete: "cascade" }),
    tariffId: integer("tariff_id").notNull().references(() => tariff.id, { onDelete: "cascade" }),
    canton: text("canton").notNull(),
    region: integer("region").notNull(),
    ageClass: text("age_class", { enum: ["KID", "YOUNG", "ADULT"] }).notNull(),
    subgroup: text("subgroup").notNull(),
    accident: integer("accident", { mode: "boolean" }).notNull(),
    franchiseChf: integer("franchise_chf").notNull(),
    monthlyRp: integer("monthly_rp").notNull(),
  },
  (t) => [
    uniqueIndex("premium_unique").on(t.tariffId, t.canton, t.region, t.ageClass, t.subgroup, t.accident, t.franchiseChf),
    index("premium_lookup").on(t.datasetId, t.canton, t.region, t.ageClass, t.accident, t.subgroup),
  ],
);

export const household = sqliteTable("household", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  street: text("street").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  city: text("city").notNull().default(""),
  /** Commune de domicile (déterminante pour la région de primes) et son n° OFS. */
  commune: text("commune").notNull().default(""),
  bfsNumber: integer("bfs_number"),
  canton: text("canton").notNull(),
  region: integer("region").notNull(),
  createdAt: createdAt(),
});

export const person = sqliteTable("person", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthDate: text("birth_date").notNull(),
  /** Échelon de rabais enfant (K1, K3…) lu sur la police. */
  kidSubgroup: text("kid_subgroup").notNull().default("K1"),
  /** Couvert par l'assurance-accidents de l'employeur (≥ 8 h/semaine) : accident exclu. */
  employedAccidentCover: integer("employed_accident_cover", { mode: "boolean" }).notNull().default(false),
  healthCostsRp: integer("health_costs_rp").notNull().default(50000),
  allowedModels: text("allowed_models", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  excludedInsurerIds: text("excluded_insurer_ids", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
  doctorName: text("doctor_name"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const lamalPolicy = sqliteTable(
  "lamal_policy",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    personId: integer("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
    coverageYear: integer("coverage_year").notNull(),
    insurerId: integer("insurer_id").notNull().references(() => insurer.id),
    policyNumber: text("policy_number"),
    tariffCode: text("tariff_code"),
    tariffLabel: text("tariff_label"),
    modelType: text("model_type", { enum: ["STANDARD", "PRAXIS", "TELMED", "PHARMACY", "FLEX", "OTHER"] }).notNull(),
    franchiseChf: integer("franchise_chf").notNull(),
    accident: integer("accident", { mode: "boolean" }).notNull(),
    /** Prime brute mensuelle réellement facturée (police), avant redistribution CO2. */
    billedMonthlyRp: integer("billed_monthly_rp").notNull(),
    source: text("source", { enum: ["MANUAL", "OFSP", "REVIEW"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lamal_policy_person_year").on(t.personId, t.coverageYear)],
);

export const lcaPolicy = sqliteTable("lca_policy", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personId: integer("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
  insurerName: text("insurer_name").notNull(),
  linkedInsurerId: integer("linked_insurer_id").references(() => insurer.id),
  productName: text("product_name").notNull(),
  category: text("category", { enum: ["HOSPITAL", "AMBULATORY", "DENTAL", "OTHER"] }).notNull(),
  /** Famille de garantie (liste fixe, voir domain/lca) ; null pour les saisies anciennes. */
  guarantee: text("guarantee"),
  policyNumber: text("policy_number"),
  monthlyRp: integer("monthly_rp"),
  startDate: text("start_date"),
  minTermEnd: text("min_term_end"),
  noticeMonths: integer("notice_months"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
});

export const tariffLineage = sqliteTable(
  "tariff_lineage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    insurerId: integer("insurer_id").notNull().references(() => insurer.id),
    fromYear: integer("from_year").notNull(),
    fromCode: text("from_code").notNull(),
    toYear: integer("to_year").notNull(),
    toCode: text("to_code").notNull(),
  },
  (t) => [uniqueIndex("lineage_unique").on(t.insurerId, t.fromYear, t.fromCode, t.toYear)],
);

export const review = sqliteTable(
  "review",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id").notNull().references(() => household.id, { onDelete: "cascade" }),
    targetYear: integer("target_year").notNull(),
    datasetId: integer("dataset_id").notNull().references(() => tariffDataset.id),
    status: text("status", { enum: ["OPEN", "DECIDED", "LETTERS_SENT", "CLOSED"] }).notNull(),
    /** Stratégie choisie pour comparer (économie max, maintien, équilibre) ; null = pas encore choisie. */
    strategy: text("strategy", { enum: ["ECONOMY", "KEEP", "BALANCE"] }),
    /** Besoins confirmés (franchise, modèles, consommation) : le comparateur peut s'ouvrir. */
    needsConfirmedAt: text("needs_confirmed_at"),
    createdAt: createdAt(),
    closedAt: text("closed_at"),
  },
  (t) => [uniqueIndex("review_household_year").on(t.householdId, t.targetYear)],
);

export const reviewLine = sqliteTable(
  "review_line",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reviewId: integer("review_id").notNull().references(() => review.id, { onDelete: "cascade" }),
    personId: integer("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
    currentPolicyId: integer("current_policy_id").notNull().references(() => lamalPolicy.id),
    targetAgeClass: text("target_age_class", { enum: ["KID", "YOUNG", "ADULT"] }).notNull(),
    accident: integer("accident", { mode: "boolean" }).notNull(),
    subgroup: text("subgroup").notNull(),
    renewalStatus: text("renewal_status", { enum: ["MATCHED", "PROBABLE", "AMBIGUOUS", "MISSING"] }).notNull(),
    renewalTariffCode: text("renewal_tariff_code"),
    renewalLabel: text("renewal_label"),
    renewalFranchiseChf: integer("renewal_franchise_chf").notNull(),
    renewalMonthlyRp: integer("renewal_monthly_rp"),
    decision: text("decision", { enum: ["UNDECIDED", "KEEP", "SWITCH", "ADJUST"] }).notNull().default("UNDECIDED"),
    chosenInsurerId: integer("chosen_insurer_id").references(() => insurer.id),
    chosenTariffCode: text("chosen_tariff_code"),
    chosenLabel: text("chosen_label"),
    chosenModelType: text("chosen_model_type"),
    chosenFranchiseChf: integer("chosen_franchise_chf"),
    chosenMonthlyRp: integer("chosen_monthly_rp"),
    chosenTotalRp: integer("chosen_total_rp"),
    decidedAt: text("decided_at"),
    doctorCheck: text("doctor_check", { enum: ["YES", "NO", "UNKNOWN"] }).notNull().default("UNKNOWN"),
    lcaAckAt: text("lca_ack_at"),
    affiliationRequestedAt: text("affiliation_requested_at"),
    affiliationConfirmedAt: text("affiliation_confirmed_at"),
    /** Complémentaires à demander à la nouvelle caisse (clés de domain/lca) ; null = reprendre celles en cours. */
    lcaWishes: text("lca_wishes", { mode: "json" }).$type<string[]>(),
    /** Franchise souhaitée pour comparer ; null = l'app cherche la plus avantageuse. */
    wishFranchiseChf: integer("wish_franchise_chf"),
    /** Modèles acceptés pour ce rituel ; null = préférences de la personne. */
    wishModels: text("wish_models", { mode: "json" }).$type<string[]>(),
  },
  (t) => [uniqueIndex("review_line_person").on(t.reviewId, t.personId)],
);

export const letter = sqliteTable("letter", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reviewId: integer("review_id").notNull().references(() => review.id, { onDelete: "cascade" }),
  insurerId: integer("insurer_id").notNull().references(() => insurer.id),
  kind: text("kind", { enum: ["TERMINATION", "CHANGE"] }).notNull(),
  lineIds: text("line_ids", { mode: "json" }).$type<number[]>().notNull(),
  /** Contenu figé au moment de la génération : la lettre ne change plus après. */
  content: text("content", { mode: "json" }).notNull(),
  generatedAt: createdAt(),
  sentAt: text("sent_at"),
  trackingNumber: text("tracking_number"),
  acknowledgedAt: text("acknowledged_at"),
});

/** Demande d'offre adressée à une nouvelle caisse (contenu figé, comme une lettre). */
export const offerRequest = sqliteTable("offer_request", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reviewId: integer("review_id").notNull().references(() => review.id, { onDelete: "cascade" }),
  insurerId: integer("insurer_id").notNull().references(() => insurer.id),
  lineIds: text("line_ids", { mode: "json" }).$type<number[]>().notNull(),
  content: text("content", { mode: "json" }).notNull(),
  generatedAt: createdAt(),
  sentAt: text("sent_at"),
  answeredAt: text("answered_at"),
});

/** Signature dessinée à l'écran (PNG en data URL), apposée sur les courriers de la personne. */
export const signature = sqliteTable("signature", {
  personId: integer("person_id").primaryKey().references(() => person.id, { onDelete: "cascade" }),
  dataUrl: text("data_url").notNull(),
  createdAt: createdAt(),
});

export const pushSubscription = sqliteTable("push_subscription", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull().unique(),
  keys: text("keys", { mode: "json" }).$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: createdAt(),
});

export const notificationLog = sqliteTable(
  "notification_log",
  {
    key: text("key").notNull(),
    sentAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.key] })],
);
