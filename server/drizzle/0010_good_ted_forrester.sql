-- 18e: przed usunięciem kolumn: sklep dopisany do uwag, 'Zamówione' -> 'Do kupienia'. Wpisy w changes, żeby telefony dostały zmianę.
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'shopping', `id`, 'update', NULL, json_object('id', `id`, 'createdAt', `created_at`, 'createdBy', `created_by`, 'updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'deletedAt', NULL, 'co', `co`,
    'status', CASE WHEN `status` = 'Zamówione' THEN 'Do kupienia' ELSE `status` END,
    'uwagi', CASE WHEN trim(`sklep`) = '' THEN `uwagi` WHEN trim(`uwagi`) = '' THEN 'sklep: ' || trim(`sklep`) ELSE trim(`uwagi`) || ' · sklep: ' || trim(`sklep`) END,
    'by', `by`, 'kupioneAt', `kupione_at`, 'kupioneBy', `kupione_by`)
  FROM `shopping` WHERE `deleted_at` IS NULL AND (`status` = 'Zamówione' OR trim(`sklep`) <> '');--> statement-breakpoint
UPDATE `shopping` SET `uwagi` = CASE WHEN trim(`uwagi`) = '' THEN 'sklep: ' || trim(`sklep`) ELSE trim(`uwagi`) || ' · sklep: ' || trim(`sklep`) END, `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE trim(`sklep`) <> '';--> statement-breakpoint
UPDATE `shopping` SET `status` = 'Do kupienia', `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE `status` = 'Zamówione' AND `deleted_at` IS NULL;--> statement-breakpoint
ALTER TABLE `shopping` DROP COLUMN `sklep`;--> statement-breakpoint
ALTER TABLE `shopping` DROP COLUMN `grupa`;--> statement-breakpoint
ALTER TABLE `shopping` DROP COLUMN `kwota_gr`;--> statement-breakpoint
-- Słownik grupa_zakupow i 'Zamówione' usunięte miękko; wpis w changes tylko dla wierszy usuwanych teraz.
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'dict', `id`, 'delete', NULL, json_object('id', `id`, 'rodzaj', `rodzaj`, 'wartosc', `wartosc`, 'deletedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  FROM `dict` WHERE `deleted_at` IS NULL AND (`rodzaj` = 'grupa_zakupow' OR (`rodzaj` = 'status_zakupu' AND `wartosc` = 'Zamówione'));--> statement-breakpoint
UPDATE `dict` SET `deleted_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now'), `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE `deleted_at` IS NULL AND (`rodzaj` = 'grupa_zakupow' OR (`rodzaj` = 'status_zakupu' AND `wartosc` = 'Zamówione'));
