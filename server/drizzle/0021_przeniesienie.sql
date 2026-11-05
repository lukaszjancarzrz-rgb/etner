CREATE TABLE `migration_review` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`co` text NOT NULL,
	`arkusz` text NOT NULL,
	`wiersz` integer,
	`dzien` text,
	`osoba` text DEFAULT '' NOT NULL,
	`tekst` text DEFAULT '' NOT NULL,
	`opis` text NOT NULL,
	`ile` integer DEFAULT 1 NOT NULL,
	`pominiete` integer DEFAULT false NOT NULL,
	`przejrzane` integer DEFAULT false NOT NULL
);
