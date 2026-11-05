CREATE TABLE `car_faults` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`car_id` text NOT NULL,
	`opis` text NOT NULL,
	`by` text NOT NULL,
	`naprawa_dzien` text,
	FOREIGN KEY (`car_id`) REFERENCES `cars`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cars` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`nazwa` text NOT NULL,
	`ekipa` text,
	`kolejnosc` integer DEFAULT 0 NOT NULL
);
