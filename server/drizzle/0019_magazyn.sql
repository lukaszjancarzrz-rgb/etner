CREATE TABLE `warehouse_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`nazwa` text NOT NULL,
	`ilosc` text DEFAULT '' NOT NULL,
	`by` text NOT NULL,
	`zabrane_at` text,
	`zabrane_by` text
);
