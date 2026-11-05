CREATE TABLE `checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`ekipa` text NOT NULL,
	`dzien` text NOT NULL,
	`tekst` text NOT NULL,
	`zabrane` integer DEFAULT false NOT NULL,
	`zabrane_by` text,
	`zabrane_at` text
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`tekst` text NOT NULL,
	`priorytet` integer,
	`grupa` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`termin` text,
	`cykliczne` integer DEFAULT false NOT NULL,
	`ostatnio` text,
	`uwagi` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopping` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`co` text NOT NULL,
	`sklep` text DEFAULT '' NOT NULL,
	`grupa` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`kwota_gr` integer,
	`uwagi` text DEFAULT '' NOT NULL,
	`by` text NOT NULL,
	`kupione_at` text,
	`kupione_by` text
);
