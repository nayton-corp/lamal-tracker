CREATE TABLE `annual_review` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`target_year` integer NOT NULL,
	`dataset_id` integer NOT NULL,
	`deadline_date` text NOT NULL,
	`recommended_send_by` text NOT NULL,
	`co2_annual_rp` integer,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dataset_id`) REFERENCES `tariff_dataset`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `annual_review_household_year_uq` ON `annual_review` (`household_id`,`target_year`);--> statement-breakpoint
CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `co2_redistribution` (
	`year` integer PRIMARY KEY NOT NULL,
	`annual_amount_rp` integer NOT NULL,
	`source_note` text
);
--> statement-breakpoint
CREATE TABLE `household` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`street` text DEFAULT '' NOT NULL,
	`npa` text DEFAULT '' NOT NULL,
	`locality` text DEFAULT '' NOT NULL,
	`canton` text NOT NULL,
	`region` integer NOT NULL,
	`representative_person_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `insurer` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_source` text NOT NULL,
	`website` text
);
--> statement-breakpoint
CREATE TABLE `insurer_address` (
	`insurer_id` integer NOT NULL,
	`valid_from_year` integer NOT NULL,
	`recipient_name` text NOT NULL,
	`address_lines` text NOT NULL,
	`source` text,
	`verified_at` text,
	PRIMARY KEY(`insurer_id`, `valid_from_year`),
	FOREIGN KEY (`insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `job_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`ok` integer,
	`message` text
);
--> statement-breakpoint
CREATE TABLE `lamal_parameters` (
	`year` integer PRIMARY KEY NOT NULL,
	`franchises_adult` text NOT NULL,
	`franchises_kid` text NOT NULL,
	`coinsurance_rate_bp` integer NOT NULL,
	`coinsurance_max_adult_rp` integer NOT NULL,
	`coinsurance_max_kid_rp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lamal_policy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`coverage_year` integer NOT NULL,
	`insurer_id` integer NOT NULL,
	`policy_number` text DEFAULT '' NOT NULL,
	`premium_tariff_id` integer,
	`tariff_code` text,
	`tariff_label` text,
	`model_type` text NOT NULL,
	`franchise_chf` integer NOT NULL,
	`accident_included` integer NOT NULL,
	`billed_monthly_rp` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`premium_tariff_id`) REFERENCES `premium_tariff`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lamal_policy_person_year_uq` ON `lamal_policy` (`person_id`,`coverage_year`);--> statement-breakpoint
CREATE TABLE `lca_policy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`insurer_id` integer NOT NULL,
	`product_name` text NOT NULL,
	`category` text NOT NULL,
	`policy_number` text DEFAULT '' NOT NULL,
	`start_date` text,
	`min_term_end` text,
	`notice_months` integer DEFAULT 3 NOT NULL,
	`bundled_discount` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lca_premium` (
	`lca_policy_id` integer NOT NULL,
	`year` integer NOT NULL,
	`monthly_rp` integer NOT NULL,
	PRIMARY KEY(`lca_policy_id`, `year`),
	FOREIGN KEY (`lca_policy_id`) REFERENCES `lca_policy`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `model_override` (
	`insurer_id` integer NOT NULL,
	`tariff_code` text NOT NULL,
	`model_type` text NOT NULL,
	PRIMARY KEY(`insurer_id`, `tariff_code`)
);
--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`read_at` text,
	`pushed_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_log_key_unique` ON `notification_log` (`key`);--> statement-breakpoint
CREATE TABLE `person` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`birth_date` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `person_prefs` (
	`person_id` integer PRIMARY KEY NOT NULL,
	`allowed_models` text DEFAULT '[]' NOT NULL,
	`allowed_franchises` text DEFAULT '[]' NOT NULL,
	`expected_health_costs_rp` integer DEFAULT 50000 NOT NULL,
	`accident_included` integer DEFAULT false NOT NULL,
	`doctor_name` text DEFAULT '' NOT NULL,
	`excluded_insurers` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `premium_tariff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dataset_id` integer NOT NULL,
	`insurer_id` integer NOT NULL,
	`canton` text NOT NULL,
	`region` integer NOT NULL,
	`age_class` text NOT NULL,
	`age_subgroup` text DEFAULT '' NOT NULL,
	`accident_included` integer NOT NULL,
	`model_type` text NOT NULL,
	`tariff_type_raw` text NOT NULL,
	`tariff_code` text NOT NULL,
	`tariff_label` text NOT NULL,
	`franchise_chf` integer NOT NULL,
	`monthly_premium_rp` integer NOT NULL,
	FOREIGN KEY (`dataset_id`) REFERENCES `tariff_dataset`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `premium_tariff_lookup_idx` ON `premium_tariff` (`dataset_id`,`canton`,`region`,`age_class`,`accident_included`,`franchise_chf`);--> statement-breakpoint
CREATE INDEX `premium_tariff_insurer_idx` ON `premium_tariff` (`dataset_id`,`insurer_id`,`tariff_code`);--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`keys` text NOT NULL,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscription` (`endpoint`);--> statement-breakpoint
CREATE TABLE `review_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`current_policy_id` integer,
	`target_age_class` text NOT NULL,
	`age_class_changed` integer NOT NULL,
	`renewal_tariff_id` integer,
	`renewal_monthly_rp` integer,
	`renewal_confidence` text NOT NULL,
	`renewal_label` text,
	`renewal_franchise_chf` integer,
	`decision` text,
	`chosen_tariff_id` integer,
	`chosen_insurer_id` integer,
	`chosen_tariff_code` text,
	`chosen_label` text,
	`chosen_model_type` text,
	`chosen_franchise_chf` integer,
	`chosen_accident_included` integer,
	`chosen_monthly_rp` integer,
	`chosen_annual_cost_rp` integer,
	`decided_at` text,
	`doctor_check` text DEFAULT 'UNKNOWN' NOT NULL,
	`lca_ack_at` text,
	`affiliation_requested_at` text,
	`affiliation_confirmed_at` text,
	`new_policy_number` text,
	FOREIGN KEY (`review_id`) REFERENCES `annual_review`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_policy_id`) REFERENCES `lamal_policy`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`renewal_tariff_id`) REFERENCES `premium_tariff`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chosen_tariff_id`) REFERENCES `premium_tariff`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_line_review_person_uq` ON `review_line` (`review_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `tariff_dataset` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer NOT NULL,
	`source_label` text NOT NULL,
	`source_url` text,
	`file_name` text NOT NULL,
	`file_sha256` text NOT NULL,
	`parser_version` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`row_count` integer NOT NULL,
	`status` text NOT NULL,
	`validation_report` text NOT NULL,
	`activated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tariff_dataset_sha_uq` ON `tariff_dataset` (`file_sha256`);--> statement-breakpoint
CREATE INDEX `tariff_dataset_year_idx` ON `tariff_dataset` (`year`,`status`);--> statement-breakpoint
CREATE TABLE `tariff_lineage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`insurer_id` integer NOT NULL,
	`from_year` integer NOT NULL,
	`from_code` text NOT NULL,
	`to_year` integer NOT NULL,
	`to_code` text NOT NULL,
	`confirmed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tariff_lineage_uq` ON `tariff_lineage` (`insurer_id`,`from_year`,`from_code`,`to_year`);--> statement-breakpoint
CREATE TABLE `termination_letter` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`insurer_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`pdf_sha256` text NOT NULL,
	`pdf_path` text NOT NULL,
	`sent_at` text,
	`tracking_no` text,
	`insurer_ack_at` text,
	FOREIGN KEY (`review_id`) REFERENCES `annual_review`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `termination_letter_line` (
	`letter_id` integer NOT NULL,
	`review_line_id` integer NOT NULL,
	PRIMARY KEY(`letter_id`, `review_line_id`),
	FOREIGN KEY (`letter_id`) REFERENCES `termination_letter`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`review_line_id`) REFERENCES `review_line`(`id`) ON UPDATE no action ON DELETE cascade
);
