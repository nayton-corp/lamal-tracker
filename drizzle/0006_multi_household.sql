-- Plusieurs foyers : comptes, appartenance, réglages par foyer. Le mot de passe de l'instance
-- devient le compte administrateur n° 1, propriétaire du foyer existant ; ses sessions restent ouvertes.
CREATE TABLE `app_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text,
	`password` text NOT NULL,
	`role` text DEFAULT 'USER' NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_user_email_unique` ON `app_user` (`email`);--> statement-breakpoint
INSERT INTO `app_user` (`id`, `password`, `role`) SELECT 1, `value`, 'ADMIN' FROM `settings` WHERE `key` = 'auth.password';--> statement-breakpoint
DELETE FROM `settings` WHERE `key` IN ('auth.password', 'auth.failures');--> statement-breakpoint
CREATE TABLE `household_member` (
	`household_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text DEFAULT 'OWNER' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`household_id`, `user_id`),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_member_user` ON `household_member` (`user_id`);--> statement-breakpoint
-- Jusqu'ici, l'app n'utilisait que le premier foyer.
INSERT INTO `household_member` (`household_id`, `user_id`, `role`)
	SELECT min(`id`), 1, 'OWNER' FROM `household` WHERE EXISTS (SELECT 1 FROM `app_user` WHERE `id` = 1) HAVING min(`id`) IS NOT NULL;--> statement-breakpoint
CREATE TABLE `household_setting` (
	`household_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`household_id`, `key`),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `household_setting` (`household_id`, `key`, `value`)
	SELECT (SELECT min(`id`) FROM `household`), 'mode', `value` FROM `settings`
	WHERE `key` = 'household.mode' AND EXISTS (SELECT 1 FROM `household`);--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'household.mode';--> statement-breakpoint
-- Correspondances de tarifs : propres à chaque foyer (un foyer ne modifie pas le renouvellement d'un autre).
CREATE TABLE `__new_tariff_lineage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`insurer_id` integer NOT NULL,
	`from_year` integer NOT NULL,
	`from_code` text NOT NULL,
	`to_year` integer NOT NULL,
	`to_code` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`insurer_id`) REFERENCES `insurer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tariff_lineage` (`id`, `household_id`, `insurer_id`, `from_year`, `from_code`, `to_year`, `to_code`)
	SELECT `id`, (SELECT min(`id`) FROM `household`), `insurer_id`, `from_year`, `from_code`, `to_year`, `to_code` FROM `tariff_lineage`
	WHERE EXISTS (SELECT 1 FROM `household`);--> statement-breakpoint
DROP TABLE `tariff_lineage`;--> statement-breakpoint
ALTER TABLE `__new_tariff_lineage` RENAME TO `tariff_lineage`;--> statement-breakpoint
CREATE UNIQUE INDEX `lineage_unique` ON `tariff_lineage` (`household_id`,`insurer_id`,`from_year`,`from_code`,`to_year`);--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`device` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_session` (`id`, `user_id`, `token_hash`, `device`, `created_at`, `last_seen_at`, `expires_at`)
	SELECT `id`, 1, `token_hash`, `device`, `created_at`, `last_seen_at`, `expires_at` FROM `session`
	WHERE EXISTS (SELECT 1 FROM `app_user` WHERE `id` = 1);--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_hash_unique` ON `session` (`token_hash`);--> statement-breakpoint
CREATE TABLE `__new_push_subscription` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`keys` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_push_subscription` (`id`, `user_id`, `endpoint`, `keys`, `created_at`)
	SELECT `id`, 1, `endpoint`, `keys`, `created_at` FROM `push_subscription`
	WHERE EXISTS (SELECT 1 FROM `app_user` WHERE `id` = 1);--> statement-breakpoint
DROP TABLE `push_subscription`;--> statement-breakpoint
ALTER TABLE `__new_push_subscription` RENAME TO `push_subscription`;--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscription` (`endpoint`);--> statement-breakpoint
-- Rappels déjà envoyés : désormais dédoublonnés par foyer.
UPDATE `notification_log` SET `key` = 'h' || (SELECT min(`id`) FROM `household`) || ':' || `key`
	WHERE (`key` LIKE 'rappel-%' OR `key` LIKE 'pingen-echec-%') AND EXISTS (SELECT 1 FROM `household`);
