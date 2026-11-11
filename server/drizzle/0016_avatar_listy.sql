CREATE TABLE `checklist_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`nazwa` text NOT NULL,
	`kategorie` text DEFAULT '[]' NOT NULL,
	`rodzaje` text DEFAULT '[]' NOT NULL,
	`pozycje` text DEFAULT '[]' NOT NULL,
	`kolejnosc` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_key` text;