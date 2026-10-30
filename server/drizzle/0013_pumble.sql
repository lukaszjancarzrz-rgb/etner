CREATE TABLE `pumble_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`job_id` text NOT NULL,
	`message_id` text NOT NULL,
	`author_name` text NOT NULL,
	`text` text NOT NULL,
	`sent_at` text NOT NULL,
	`thread_root_id` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pumble_messages_message_id_unique` ON `pumble_messages` (`message_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `email` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `pumble_channel_id` text;