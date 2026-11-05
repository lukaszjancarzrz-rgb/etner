CREATE TABLE `dict` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`rodzaj` text NOT NULL,
	`wartosc` text NOT NULL,
	`kolejnosc` integer NOT NULL,
	`grupa` text,
	`platne` integer,
	`kolor` text
);
--> statement-breakpoint
CREATE TABLE `schedule_people` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`kolejnosc` integer DEFAULT 0 NOT NULL,
	`nazwa` text NOT NULL,
	`user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
