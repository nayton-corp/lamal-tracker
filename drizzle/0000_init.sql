CREATE TABLE `household` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`street` text DEFAULT '' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`canton` text NOT NULL,
	`region` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `insurer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bag_number` integer NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`termination_address` text,
	`address_verified_at` text,
	`website` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `insurer_bag_number_unique` ON `insurer` (`bag_number`);--> statement-breakpoint
CREATE TABLE `lamal_parameters` (
	`year` integer PRIMARY KEY NOT NULL,
	`franchises_adult` text NOT NULL,
	`franchises_kid` text NOT NULL,
	`coinsurance_rate_bp` integer NOT NULL,
	`coinsurance_max_adult_rp` integer NOT NULL,
	`coinsurance_max_kid_rp` integer NOT NULL,
	`co2_annual_rp` integer,
	`source_note` text
);
--> statement-breakpoint
CREATE TABLE `lamal_policy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`coverage_year` integer NOT NULL,
	`insurer_id` integer NOT NULL,
	`policy_number` text,
	`tariff_code` text,
	`tariff_label` text,
	`model_type` text NOT NULL,
	`franchise_chf` integer NOT NULL,
	`accident` integer NOT NULL,
	`billed_monthly_rp` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lamal_policy_person_year` ON `lamal_policy` (`person_id`,`coverage_year`);--> statement-breakpoint
CREATE TABLE `lca_policy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`insurer_name` text NOT NULL,
	`linked_insurer_id` integer,
	`product_name` text NOT NULL,
	`category` text NOT NULL,
	`policy_number` text,
	`monthly_rp` integer,
	`start_date` text,
	`min_term_end` text,
	`notice_months` integer,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `letter` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`insurer_id` integer NOT NULL,
	`kind` text NOT NULL,
	`line_ids` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`sent_at` text,
	`tracking_number` text,
	`acknowledged_at` text,
	FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_log` (
	`key` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `person` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`birth_date` text NOT NULL,
	`kid_subgroup` text DEFAULT 'K1' NOT NULL,
	`employed_accident_cover` integer DEFAULT false NOT NULL,
	`health_costs_rp` integer DEFAULT 50000 NOT NULL,
	`allowed_models` text DEFAULT '[]' NOT NULL,
	`excluded_insurer_ids` text DEFAULT '[]' NOT NULL,
	`doctor_name` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `premium` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dataset_id` integer NOT NULL,
	`tariff_id` integer NOT NULL,
	`canton` text NOT NULL,
	`region` integer NOT NULL,
	`age_class` text NOT NULL,
	`subgroup` text NOT NULL,
	`accident` integer NOT NULL,
	`franchise_chf` integer NOT NULL,
	`monthly_rp` integer NOT NULL,
	FOREIGN KEY (`dataset_id`) REFERENCES `tariff_dataset`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tariff_id`) REFERENCES `tariff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `premium_unique` ON `premium` (`tariff_id`,`canton`,`region`,`age_class`,`subgroup`,`accident`,`franchise_chf`);--> statement-breakpoint
CREATE INDEX `premium_lookup` ON `premium` (`dataset_id`,`canton`,`region`,`age_class`,`accident`,`subgroup`);--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`keys` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscription` (`endpoint`);--> statement-breakpoint
CREATE TABLE `review` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`target_year` integer NOT NULL,
	`dataset_id` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dataset_id`) REFERENCES `tariff_dataset`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_household_year` ON `review` (`household_id`,`target_year`);--> statement-breakpoint
CREATE TABLE `review_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`current_policy_id` integer NOT NULL,
	`target_age_class` text NOT NULL,
	`accident` integer NOT NULL,
	`subgroup` text NOT NULL,
	`renewal_status` text NOT NULL,
	`renewal_tariff_code` text,
	`renewal_label` text,
	`renewal_franchise_chf` integer NOT NULL,
	`renewal_monthly_rp` integer,
	`decision` text DEFAULT 'UNDECIDED' NOT NULL,
	`chosen_insurer_id` integer,
	`chosen_tariff_code` text,
	`chosen_label` text,
	`chosen_model_type` text,
	`chosen_franchise_chf` integer,
	`chosen_monthly_rp` integer,
	`chosen_total_rp` integer,
	`decided_at` text,
	`doctor_check` text DEFAULT 'UNKNOWN' NOT NULL,
	`lca_ack_at` text,
	`affiliation_requested_at` text,
	`affiliation_confirmed_at` text,
	FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_policy_id`) REFERENCES `lamal_policy`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chosen_insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_line_person` ON `review_line` (`review_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tariff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dataset_id` integer NOT NULL,
	`insurer_id` integer NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`type_raw` text NOT NULL,
	`model_type` text NOT NULL,
	FOREIGN KEY (`dataset_id`) REFERENCES `tariff_dataset`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tariff_unique` ON `tariff` (`dataset_id`,`insurer_id`,`code`);--> statement-breakpoint
CREATE TABLE `tariff_dataset` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year` integer,
	`source` text NOT NULL,
	`file_sha256` text NOT NULL,
	`status` text NOT NULL,
	`report` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tariff_dataset_year` ON `tariff_dataset` (`year`,`status`);--> statement-breakpoint
CREATE TABLE `tariff_lineage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`insurer_id` integer NOT NULL,
	`from_year` integer NOT NULL,
	`from_code` text NOT NULL,
	`to_year` integer NOT NULL,
	`to_code` text NOT NULL,
	FOREIGN KEY (`insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lineage_unique` ON `tariff_lineage` (`insurer_id`,`from_year`,`from_code`,`to_year`);