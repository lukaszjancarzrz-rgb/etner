CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`folder_id` text NOT NULL,
	`nazwa` text NOT NULL,
	`producent` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`nr_seryjny` text DEFAULT '' NOT NULL,
	`montaz` text,
	`job_id` text,
	`gwarancja_do` text,
	`uwagi` text DEFAULT '' NOT NULL,
	`dla_klienta` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `passport_folders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `passport_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`site_id` text NOT NULL,
	`kategoria` text NOT NULL,
	`nastepny_serwis` text,
	`cykl_mies` integer,
	`przypomnienia` integer DEFAULT true NOT NULL,
	`wyslano_30_dla` text,
	`wyslano_7_dla` text,
	`notatka_rozliczenie` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passport_folders_site_kat` ON `passport_folders` (`site_id`,`kategoria`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `passports` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`site_id` text NOT NULL,
	`numer` text NOT NULL,
	`token` text,
	`token_at` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passports_site` ON `passports` (`site_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `service_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`folder_id` text NOT NULL,
	`dzien` text NOT NULL,
	`job_id` text,
	`czynnosci` text DEFAULT '[]' NOT NULL,
	`uwagi` text DEFAULT '' NOT NULL,
	`author_id` text NOT NULL,
	`dla_klienta` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `passport_folders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD `typ_dok` text;--> statement-breakpoint
ALTER TABLE `dict` ADD `kategoria` text;