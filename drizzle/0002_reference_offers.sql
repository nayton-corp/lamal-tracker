CREATE TABLE `insurer_indicator` (
	`bag_number` integer NOT NULL,
	`year` integer NOT NULL,
	`insured` integer NOT NULL,
	`premium_per_insured_rp` integer NOT NULL,
	`benefits_per_insured_rp` integer,
	`admin_per_insured_rp` integer,
	`reserves_per_insured_rp` integer,
	PRIMARY KEY(`bag_number`, `year`)
);
--> statement-breakpoint
CREATE TABLE `offer_request` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`review_id` integer NOT NULL,
	`insurer_id` integer NOT NULL,
	`line_ids` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`sent_at` text,
	`answered_at` text,
	FOREIGN KEY (`review_id`) REFERENCES `review`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `insurer` ADD `legal_name_fr` text;--> statement-breakpoint
ALTER TABLE `insurer` ADD `official_address` text;--> statement-breakpoint
ALTER TABLE `insurer` ADD `email` text;--> statement-breakpoint
ALTER TABLE `insurer` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `insurer` ADD `group_name` text;--> statement-breakpoint
ALTER TABLE `insurer` ADD `directory_date` text;--> statement-breakpoint
ALTER TABLE `lamal_parameters` ADD `co2_source` text DEFAULT 'OFFICIAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `lca_policy` ADD `guarantee` text;--> statement-breakpoint
ALTER TABLE `review_line` ADD `lca_wishes` text;--> statement-breakpoint
UPDATE `lamal_parameters` SET `co2_source` = 'USER' WHERE `source_note` = 'Saisi manuellement';
