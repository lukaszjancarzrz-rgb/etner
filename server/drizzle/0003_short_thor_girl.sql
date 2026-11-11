CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`firma_id` text NOT NULL,
	`typ` text NOT NULL,
	`nazwa` text NOT NULL,
	`telefony` text DEFAULT '[]' NOT NULL,
	`emaile` text DEFAULT '[]' NOT NULL,
	`nip` text DEFAULT '' NOT NULL,
	`notatki` text DEFAULT '' NOT NULL,
	`szukaj` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`firma_id`) REFERENCES `firmy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`client_id` text NOT NULL,
	`nazwa` text DEFAULT '' NOT NULL,
	`adres` text DEFAULT '' NOT NULL,
	`miejscowosc` text DEFAULT '' NOT NULL,
	`mapa` text DEFAULT '' NOT NULL,
	`opis` text DEFAULT '' NOT NULL,
	`szukaj` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
