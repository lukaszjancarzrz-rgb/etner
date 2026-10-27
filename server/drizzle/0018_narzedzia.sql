CREATE TABLE `tools` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`nazwa` text NOT NULL,
	`car_id` text,
	`podmiejsce` text,
	`by` text NOT NULL,
	FOREIGN KEY (`car_id`) REFERENCES `cars`(`id`) ON UPDATE no action ON DELETE no action
);
