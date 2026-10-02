import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const bool = (name: string) => integer(name, { mode: "boolean" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();
const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

// ═══ RÉFÉRENTIEL (immuable par année) ═══

export const tariffDataset = sqliteTable(
  "tariff_dataset",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: integer("year").notNull(),
    sourceLabel: text("source_label").notNull(),
    sourceUrl: text("source_url"),
    fileName: text("file_name").notNull(),
    fileSha256: text("file_sha256").notNull(),
    parserVersion: text("parser_version").notNull(),
    importedAt: createdAt(),
    rowCount: integer("row_count").notNull(),
    status: text("status", { enum: ["STAGING", "ACTIVE", "SUPERSEDED", "DISCARDED"] }).notNull(),
    validationReport: json<unknown>("validation_report").notNull(),
    activatedAt: text("activated_at"),
  },
  (t) => [uniqueIndex("tariff_dataset_sha_uq").on(t.fileSha256), index("tariff_dataset_year_idx").on(t.year, t.status)],
);

export const insurer = sqliteTable("insurer", {
  /** Numéro OFSP de l'assureur, stable d'une année à l'autre. */
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  nameSource: text("name_source", { enum: ["SEED", "USER", "DATASET", "UNKNOWN"] }).notNull(),
  website: text("website"),
});

export const insurerAddress = sqliteTable(
  "insurer_address",
  {
    insurerId: integer("insurer_id")
      .notNull()
      .references(() => insurer.id),
    validFromYear: integer("valid_from_year").notNull(),
    /** Nom du destinataire tel qu'il figure sur la lettre (ex. « CSS Assurance-maladie SA »). */
    recipientName: text("recipient_name").notNull(),
    addressLines: json<string[]>("address_lines").notNull(),
    source: text("source"),
    verifiedAt: text("verified_at"),
  },
  (t) => [primaryKey({ columns: [t.insurerId, t.validFromYear] })],
);

export const premiumTariff = sqliteTable(
  "premium_tariff",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => tariffDataset.id, { onDelete: "cascade" }),
    insurerId: integer("insurer_id").notNull(),
    canton: text("canton").notNull(),
    region: integer("region").notNull(),
    ageClass: text("age_class", { enum: ["KID", "YOUNG", "ADULT"] }).notNull(),
    ageSubgroup: text("age_subgroup").notNull().default(""),
    accidentIncluded: bool("accident_included").notNull(),
    modelType: text("model_type", { enum: ["STANDARD", "FAMILY_DOCTOR", "HMO", "TELMED", "PHARMACY", "OTHER"] }).notNull(),
    tariffTypeRaw: text("tariff_type_raw").notNull(),
    tariffCode: text("tariff_code").notNull(),
    tariffLabel: text("tariff_label").notNull(),
    franchiseChf: integer("franchise_chf").notNull(),
    monthlyPremiumRp: integer("monthly_premium_rp").notNull(),
  },
  (t) => [
    index("premium_tariff_lookup_idx").on(t.datasetId, t.canton, t.region, t.ageClass, t.accidentIncluded, t.franchiseChf),
    index("premium_tariff_insurer_idx").on(t.datasetId, t.insurerId, t.tariffCode),
  ],
);

/** Correspondance de codes tarifaires d'une année à l'autre quand un produit est renommé. */
export const tariffLineage = sqliteTable(
  "tariff_lineage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    insurerId: integer("insurer_id").notNull(),
    fromYear: integer("from_year").notNull(),
    fromCode: text("from_code").notNull(),
    toYear: integer("to_year").notNull(),
    toCode: text("to_code").notNull(),
    confirmed: bool("confirmed").notNull().default(false),
  },
  (t) => [uniqueIndex("tariff_lineage_uq").on(t.insurerId, t.fromYear, t.fromCode, t.toYear)],
);

/** Corrections manuelles de la classification des modèles (Telmed classé « divers »…). */
export const modelOverride = sqliteTable(
  "model_override",
  {
    insurerId: integer("insurer_id").notNull(),
    tariffCode: text("tariff_code").notNull(),
    modelType: text("model_type", { enum: ["STANDARD", "FAMILY_DOCTOR", "HMO", "TELMED", "PHARMACY", "OTHER"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.insurerId, t.tariffCode] })],
);

export const lamalParameters = sqliteTable("lamal_parameters", {
  year: integer("year").primaryKey(),
  franchisesAdult: json<number[]>("franchises_adult").notNull(),
  franchisesKid: json<number[]>("franchises_kid").notNull(),
  coinsuranceRateBp: integer("coinsurance_rate_bp").notNull(),
  coinsuranceMaxAdultRp: integer("coinsurance_max_adult_rp").notNull(),
  coinsuranceMaxKidRp: integer("coinsurance_max_kid_rp").notNull(),
});

export const co2Redistribution = sqliteTable("co2_redistribution", {
  year: integer("year").primaryKey(),
  annualAmountRp: integer("annual_amount_rp").notNull(),
  sourceNote: text("source_note"),
});

// ═══ FOYER ═══

export const household = sqliteTable("household", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  street: text("street").notNull().default(""),
  npa: text("npa").notNull().default(""),
  locality: text("locality").notNull().default(""),
  canton: text("canton").notNull(),
  region: integer("region").notNull(),
  /** Personne qui signe les lettres pour les mineurs. */
  representativePersonId: integer("representative_person_id"),
  createdAt: createdAt(),
});

export const person = sqliteTable("person", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthDate: text("birth_date").notNull(),
  active: bool("active").notNull().default(true),
  createdAt: createdAt(),
});

export const personPrefs = sqliteTable("person_prefs", {
  personId: integer("person_id")
    .primaryKey()
    .references(() => person.id, { onDelete: "cascade" }),
  /** Vide = tous les modèles acceptés. */
  allowedModels: json<string[]>("allowed_models").notNull().default(sql`'[]'`),
  /** Vide = toutes les franchises légales. */
  allowedFranchises: json<number[]>("allowed_franchises").notNull().default(sql`'[]'`),
  expectedHealthCostsRp: integer("expected_health_costs_rp").notNull().default(50_000),
  /** Couverture accident incluse (non salarié ou moins de 8 h/semaine chez un employeur). */
  accidentIncluded: bool("accident_included").notNull().default(false),
  doctorName: text("doctor_name").notNull().default(""),
  excludedInsurers: json<number[]>("excluded_insurers").notNull().default(sql`'[]'`),
});

export const lamalPolicy = sqliteTable(
  "lamal_policy",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    personId: integer("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    coverageYear: integer("coverage_year").notNull(),
    insurerId: integer("insurer_id")
      .notNull()
      .references(() => insurer.id),
    policyNumber: text("policy_number").notNull().default(""),
    premiumTariffId: integer("premium_tariff_id").references(() => premiumTariff.id, { onDelete: "set null" }),
    tariffCode: text("tariff_code"),
    tariffLabel: text("tariff_label"),
    modelType: text("model_type", { enum: ["STANDARD", "FAMILY_DOCTOR", "HMO", "TELMED", "PHARMACY", "OTHER"] }).notNull(),
    franchiseChf: integer("franchise_chf").notNull(),
    accidentIncluded: bool("accident_included").notNull(),
    /** Prime mensuelle facturée (peut différer du tarif OFSP : rabais, paiement annuel…). */
    billedMonthlyRp: integer("billed_monthly_rp").notNull(),
    source: text("source", { enum: ["OFSP_MATCH", "MANUAL", "REVIEW"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lamal_policy_person_year_uq").on(t.personId, t.coverageYear)],
);

export const lcaPolicy = sqliteTable("lca_policy", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personId: integer("person_id")
    .notNull()
    .references(() => person.id, { onDelete: "cascade" }),
  insurerId: integer("insurer_id")
    .notNull()
    .references(() => insurer.id),
  productName: text("product_name").notNull(),
  category: text("category", { enum: ["HOSPITAL", "AMBULATORY", "DENTAL", "OTHER"] }).notNull(),
  policyNumber: text("policy_number").notNull().default(""),
  startDate: text("start_date"),
  minTermEnd: text("min_term_end"),
  noticeMonths: integer("notice_months").notNull().default(3),
  bundledDiscount: bool("bundled_discount").notNull().default(false),
  status: text("status", { enum: ["ACTIVE", "TERMINATED"] }).notNull().default("ACTIVE"),
  createdAt: createdAt(),
});

export const lcaPremium = sqliteTable(
  "lca_premium",
  {
    lcaPolicyId: integer("lca_policy_id")
      .notNull()
      .references(() => lcaPolicy.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    monthlyRp: integer("monthly_rp").notNull(),
  },
  (t) => [primaryKey({ columns: [t.lcaPolicyId, t.year] })],
);

// ═══ RITUEL ═══

export const annualReview = sqliteTable(
  "annual_review",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    targetYear: integer("target_year").notNull(),
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => tariffDataset.id),
    deadlineDate: text("deadline_date").notNull(),
    recommendedSendBy: text("recommended_send_by").notNull(),
    co2AnnualRp: integer("co2_annual_rp"),
    status: text("status", { enum: ["DRAFT", "DECIDED", "LETTERS_SENT", "CONFIRMED", "CLOSED"] }).notNull(),
    openedAt: createdAt(),
    closedAt: text("closed_at"),
  },
  (t) => [uniqueIndex("annual_review_household_year_uq").on(t.householdId, t.targetYear)],
);

export const reviewLine = sqliteTable(
  "review_line",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reviewId: integer("review_id")
      .notNull()
      .references(() => annualReview.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    currentPolicyId: integer("current_policy_id").references(() => lamalPolicy.id, { onDelete: "set null" }),
    targetAgeClass: text("target_age_class", { enum: ["KID", "YOUNG", "ADULT"] }).notNull(),
    ageClassChanged: bool("age_class_changed").notNull(),
    // Renouvellement : copie figée au moment de l'ouverture / confirmation.
    renewalTariffId: integer("renewal_tariff_id").references(() => premiumTariff.id, { onDelete: "set null" }),
    renewalMonthlyRp: integer("renewal_monthly_rp"),
    renewalConfidence: text("renewal_confidence", { enum: ["EXACT", "LINEAGE", "PROBABLE", "NONE", "MANUAL"] }).notNull(),
    renewalLabel: text("renewal_label"),
    renewalFranchiseChf: integer("renewal_franchise_chf"),
    // Décision : copie figée au moment de la décision.
    decision: text("decision", { enum: ["KEEP", "SWITCH", "CHANGE_FRANCHISE", "CHANGE_MODEL"] }),
    chosenTariffId: integer("chosen_tariff_id").references(() => premiumTariff.id, { onDelete: "set null" }),
    chosenInsurerId: integer("chosen_insurer_id"),
    chosenTariffCode: text("chosen_tariff_code"),
    chosenLabel: text("chosen_label"),
    chosenModelType: text("chosen_model_type"),
    chosenFranchiseChf: integer("chosen_franchise_chf"),
    chosenAccidentIncluded: bool("chosen_accident_included"),
    chosenMonthlyRp: integer("chosen_monthly_rp"),
    chosenAnnualCostRp: integer("chosen_annual_cost_rp"),
    decidedAt: text("decided_at"),
    doctorCheck: text("doctor_check", { enum: ["YES", "NO", "UNKNOWN"] }).notNull().default("UNKNOWN"),
    lcaAckAt: text("lca_ack_at"),
    affiliationRequestedAt: text("affiliation_requested_at"),
    affiliationConfirmedAt: text("affiliation_confirmed_at"),
    newPolicyNumber: text("new_policy_number"),
  },
  (t) => [uniqueIndex("review_line_review_person_uq").on(t.reviewId, t.personId)],
);

export const terminationLetter = sqliteTable("termination_letter", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reviewId: integer("review_id")
    .notNull()
    .references(() => annualReview.id, { onDelete: "cascade" }),
  insurerId: integer("insurer_id").notNull(),
  generatedAt: createdAt(),
  pdfSha256: text("pdf_sha256").notNull(),
  pdfPath: text("pdf_path").notNull(),
  sentAt: text("sent_at"),
  trackingNo: text("tracking_no"),
  insurerAckAt: text("insurer_ack_at"),
});

export const terminationLetterLine = sqliteTable(
  "termination_letter_line",
  {
    letterId: integer("letter_id")
      .notNull()
      .references(() => terminationLetter.id, { onDelete: "cascade" }),
    reviewLineId: integer("review_line_id")
      .notNull()
      .references(() => reviewLine.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.letterId, t.reviewLineId] })],
);

// ═══ SYSTÈME ═══

export const pushSubscription = sqliteTable("push_subscription", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull().unique(),
  keys: json<{ p256dh: string; auth: string }>("keys").notNull(),
  userAgent: text("user_agent"),
  createdAt: createdAt(),
});

/** Journal des notifications : la clé rend chaque rappel idempotent. */
export const notificationLog = sqliteTable("notification_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url"),
  createdAt: createdAt(),
  readAt: text("read_at"),
  pushedCount: integer("pushed_count").notNull().default(0),
});

export const appSetting = sqliteTable("app_setting", {
  key: text("key").primaryKey(),
  value: json<unknown>("value").notNull(),
});

export const jobRun = sqliteTable("job_run", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  job: text("job").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  ok: bool("ok"),
  message: text("message"),
});
