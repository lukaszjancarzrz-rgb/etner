CREATE TABLE `schedule_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dzien` text NOT NULL,
	`person_id` text,
	`proposal` text NOT NULL,
	`by` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dzien` text NOT NULL,
	`person_id` text NOT NULL,
	`rodzaj` text NOT NULL,
	`job_id` text,
	`kod` text,
	`tekst` text,
	`pol_dnia` integer DEFAULT false NOT NULL,
	`slot` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `schedule_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_entries_cell` ON `schedule_entries` (`dzien`,`person_id`,`slot`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `schedule_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dzien` text NOT NULL,
	`tekst` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schedule_notes_day` ON `schedule_notes` (`dzien`) WHERE deleted_at IS NULL;