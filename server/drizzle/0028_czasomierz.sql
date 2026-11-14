CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`user_id` text,
	`person_id` text NOT NULL,
	`job_id` text,
	`dzien` text NOT NULL,
	`od` text NOT NULL,
	`do` text,
	`od_cz` text,
	`do_cz` text,
	`zrodlo` text NOT NULL,
	`auto_stop` integer DEFAULT false NOT NULL,
	`przypomniano_at` text,
	`edytowal` text,
	`edytowal_at` text,
	`komentarz` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `time_entries_person_dzien` ON `time_entries` (`person_id`,`dzien`);--> statement-breakpoint
CREATE INDEX `time_entries_user` ON `time_entries` (`user_id`);