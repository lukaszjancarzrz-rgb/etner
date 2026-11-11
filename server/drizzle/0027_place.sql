CREATE TABLE `payroll_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`person_id` text NOT NULL,
	`miesiac` text NOT NULL,
	`dzien` text,
	`rodzaj` text NOT NULL,
	`kwota_gr` integer NOT NULL,
	`opis` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payroll_months` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`person_id` text NOT NULL,
	`miesiac` text NOT NULL,
	`godziny` real,
	`koszt_umowy_gr` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_months_cell` ON `payroll_months` (`person_id`,`miesiac`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `payroll_people` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`person_id` text NOT NULL,
	`forma` text DEFAULT 'brak' NOT NULL,
	`umowa_od` text,
	`umowa_do` text,
	`brutto_gr` integer,
	`koszt_reczny_gr` integer,
	`kup_gr` integer,
	`urlop_dni` real DEFAULT 0 NOT NULL,
	`etat` real,
	`staz10` integer DEFAULT false NOT NULL,
	`uwagi` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `schedule_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_people_person` ON `payroll_people` (`person_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `payroll_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`person_id` text NOT NULL,
	`od_miesiaca` text NOT NULL,
	`stawka_gr` integer NOT NULL
);
