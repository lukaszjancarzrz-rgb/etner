ALTER TABLE `shopping` DROP COLUMN `sklep`;--> statement-breakpoint
ALTER TABLE `shopping` DROP COLUMN `grupa`;--> statement-breakpoint
ALTER TABLE `shopping` DROP COLUMN `kwota_gr`;--> statement-breakpoint
-- 18e: 'Zamówione' -> 'Do kupienia'; słownik grupa_zakupow i 'Zamówione' usunięte (miękko). Wpisy w changes, żeby telefony dostały zmianę.
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'shopping', `id`, 'update', NULL, json_object('id', `id`, 'createdAt', `created_at`, 'createdBy', `created_by`, 'updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'deletedAt', NULL, 'co', `co`, 'status', 'Do kupienia', 'uwagi', `uwagi`, 'by', `by`, 'kupioneAt', `kupione_at`, 'kupioneBy', `kupione_by`)
  FROM `shopping` WHERE `status` = 'Zamówione' AND `deleted_at` IS NULL;--> statement-breakpoint
UPDATE `shopping` SET `status` = 'Do kupienia', `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE `status` = 'Zamówione' AND `deleted_at` IS NULL;--> statement-breakpoint
UPDATE `dict` SET `deleted_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now'), `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE `deleted_at` IS NULL AND (`rodzaj` = 'grupa_zakupow' OR (`rodzaj` = 'status_zakupu' AND `wartosc` = 'Zamówione'));--> statement-breakpoint
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT `updated_at`, NULL, 'dict', `id`, 'delete', NULL, json_object('id', `id`, 'rodzaj', `rodzaj`, 'wartosc', `wartosc`, 'deletedAt', `deleted_at`)
  FROM `dict` WHERE `deleted_at` IS NOT NULL AND (`rodzaj` = 'grupa_zakupow' OR (`rodzaj` = 'status_zakupu' AND `wartosc` = 'Zamówione'));
