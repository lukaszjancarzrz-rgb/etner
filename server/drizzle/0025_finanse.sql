CREATE TABLE `costs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`dzien` text NOT NULL,
	`miesiac` text NOT NULL,
	`nr_dokumentu` text DEFAULT '' NOT NULL,
	`kontrahent` text DEFAULT '' NOT NULL,
	`nip` text DEFAULT '' NOT NULL,
	`opis` text DEFAULT '' NOT NULL,
	`kategoria` text NOT NULL,
	`netto_gr` integer NOT NULL,
	`kolumna_kpir` integer NOT NULL,
	`do_wyniku` integer DEFAULT true NOT NULL,
	`uwagi` text DEFAULT '' NOT NULL,
	`by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kpir_months` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`miesiac` text NOT NULL,
	`przychod_gr` integer NOT NULL,
	`towary_gr` integer NOT NULL,
	`uboczne_gr` integer NOT NULL,
	`wynagrodzenia_gr` integer NOT NULL,
	`pozostale_gr` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kpir_months_miesiac_unique` ON `kpir_months` (`miesiac`);--> statement-breakpoint
CREATE TABLE `revenues` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`job_id` text,
	`kategoria` text,
	`klient` text DEFAULT '' NOT NULL,
	`miejscowosc` text DEFAULT '' NOT NULL,
	`opis` text DEFAULT '' NOT NULL,
	`sposob` text NOT NULL,
	`kwota_gr` integer NOT NULL,
	`netto_gr` integer NOT NULL,
	`vat_gr` integer NOT NULL,
	`dzien` text,
	`inny_miesiac` text,
	`miesiac` text,
	`nr_faktury` text DEFAULT '' NOT NULL,
	`materialy_gr` integer,
	`uwagi` text DEFAULT '' NOT NULL,
	`by` text NOT NULL
);
