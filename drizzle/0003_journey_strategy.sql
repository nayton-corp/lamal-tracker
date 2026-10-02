CREATE TABLE `signature` (
	`person_id` integer PRIMARY KEY NOT NULL,
	`data_url` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `review` ADD `strategy` text;--> statement-breakpoint
ALTER TABLE `review` ADD `needs_confirmed_at` text;--> statement-breakpoint
ALTER TABLE `review_line` ADD `wish_franchise_chf` integer;--> statement-breakpoint
ALTER TABLE `review_line` ADD `wish_models` text;