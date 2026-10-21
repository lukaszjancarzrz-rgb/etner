CREATE TABLE `job_scope_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`job_id` text NOT NULL,
	`kolejnosc` integer NOT NULL,
	`tekst` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- 18e: dotychczasowy tekst `jobs.zakres` zostaje pierwszym punktem (kolumna na razie zostaje, UI jej nie pokazuje). Id w alfabecie ULID.
INSERT INTO `job_scope_items` (`id`, `created_at`, `created_by`, `updated_at`, `deleted_at`, `job_id`, `kolejnosc`, `tekst`)
  SELECT '0' || substr(upper(hex(randomblob(13))), 1, 25), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, `id`, 1, trim(`zakres`)
  FROM `jobs` WHERE trim(`zakres`) <> '' AND `deleted_at` IS NULL;--> statement-breakpoint
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT `created_at`, NULL, 'job_scope_items', `id`, 'create', NULL, json_object('id', `id`, 'createdAt', `created_at`, 'createdBy', NULL, 'updatedAt', `updated_at`, 'deletedAt', NULL, 'jobId', `job_id`, 'kolejnosc', `kolejnosc`, 'tekst', `tekst`)
  FROM `job_scope_items`;
