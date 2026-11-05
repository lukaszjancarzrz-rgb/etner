DROP INDEX `users_token_hash_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `login` text;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_unique` ON `users` (`login`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `token_hash`;