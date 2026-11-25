CREATE TABLE `tool_service` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`tool_id` text NOT NULL,
	`dzien` text NOT NULL,
	`czynnosc` text NOT NULL,
	`by` text NOT NULL,
	FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON UPDATE no action ON DELETE no action
);
