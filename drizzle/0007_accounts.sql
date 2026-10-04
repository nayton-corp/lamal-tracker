CREATE TABLE `audit_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`household_id` integer,
	`kind` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_event_user` ON `audit_event` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_token` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`kind` text NOT NULL,
	`token_hash` text NOT NULL,
	`data` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_token_token_hash_unique` ON `auth_token` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_token_user` ON `auth_token` (`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`code_hash` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_by` integer,
	`household_id` integer,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_code_hash_unique` ON `invitation` (`code_hash`);--> statement-breakpoint
CREATE TABLE `known_device` (
	`user_id` integer NOT NULL,
	`device_hash` text NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `device_hash`),
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recovery_code` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_code_user` ON `recovery_code` (`user_id`);--> statement-breakpoint
ALTER TABLE `app_user` ADD `email_verified_at` text;--> statement-breakpoint
ALTER TABLE `app_user` ADD `totp_secret` text;--> statement-breakpoint
ALTER TABLE `app_user` ADD `totp_enabled_at` text;--> statement-breakpoint
ALTER TABLE `app_user` ADD `totp_last_step` integer;--> statement-breakpoint
ALTER TABLE `app_user` ADD `consent_at` text;--> statement-breakpoint
ALTER TABLE `app_user` ADD `disabled_at` text;--> statement-breakpoint
-- L'envoi Pingen (facturé à l'exploitant) reste ouvert au foyer de l'administrateur existant.
INSERT OR IGNORE INTO `household_setting` (`household_id`, `key`, `value`)
  SELECT `hm`.`household_id`, 'pingen.enabled', 'true' FROM `household_member` `hm` JOIN `app_user` `u` ON `u`.`id` = `hm`.`user_id` WHERE `u`.`role` = 'ADMIN';
