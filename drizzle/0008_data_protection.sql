CREATE TABLE `household_key` (
	`household_id` integer PRIMARY KEY NOT NULL,
	`wrapped_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `app_user` ADD `last_active_at` text;--> statement-breakpoint
ALTER TABLE `app_user` ADD `inactivity_notices` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_user` ADD `inactivity_notice_at` text;--> statement-breakpoint
ALTER TABLE `session` ADD `confirmed_at` text;--> statement-breakpoint
-- Dernière activité connue des comptes existants : leur dernière session, sinon leur création.
UPDATE `app_user` SET `last_active_at` = coalesce((SELECT max(`last_seen_at`) FROM `session` WHERE `session`.`user_id` = `app_user`.`id`), `created_at`);
