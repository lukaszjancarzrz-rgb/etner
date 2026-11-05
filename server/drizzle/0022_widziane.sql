CREATE TABLE `job_seen` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_seen_user_job` ON `job_seen` (`user_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `changes_entity` ON `changes` (`entity`,`entity_id`);