CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`owner_type` text,
	`owner_id` text,
	`rodzaj` text NOT NULL,
	`key_orig` text NOT NULL,
	`key_view` text,
	`key_thumb` text,
	`nazwa` text NOT NULL,
	`mime` text NOT NULL,
	`bajty` integer NOT NULL,
	`w` integer,
	`h` integer,
	`dla_klienta` integer DEFAULT false NOT NULL,
	`author_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `diary_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`author_id` text,
	`tekst` text NOT NULL,
	`dla_klienta` integer DEFAULT false NOT NULL
);
