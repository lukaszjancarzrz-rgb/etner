ALTER TABLE `tasks` ADD `cykl` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `client_id` text REFERENCES clients(id);