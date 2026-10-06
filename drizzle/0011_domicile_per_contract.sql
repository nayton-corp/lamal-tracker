ALTER TABLE `lamal_policy` ADD `commune` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lamal_policy` ADD `bfs_number` integer;--> statement-breakpoint
ALTER TABLE `lamal_policy` ADD `canton` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `lamal_policy` ADD `region` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `review_line` ADD `commune` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_line` ADD `bfs_number` integer;--> statement-breakpoint
ALTER TABLE `review_line` ADD `canton` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_line` ADD `region` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Contrats et lignes de bilan existants : domicile = adresse actuelle du foyer.
UPDATE `lamal_policy` SET `commune` = h.`commune`, `bfs_number` = h.`bfs_number`, `canton` = h.`canton`, `region` = h.`region`
FROM `person` p JOIN `household` h ON h.`id` = p.`household_id` WHERE p.`id` = `lamal_policy`.`person_id`;--> statement-breakpoint
UPDATE `review_line` SET `commune` = h.`commune`, `bfs_number` = h.`bfs_number`, `canton` = h.`canton`, `region` = h.`region`
FROM `review` r JOIN `household` h ON h.`id` = r.`household_id` WHERE r.`id` = `review_line`.`review_id`;
