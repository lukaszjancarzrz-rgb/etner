-- Fotowoltaika: domyślny kolor #c62828 był taki sam jak czerwień „nowe”; nowy #c4501b. Tylko wiersze z dawnym kolorem domyślnym
-- (kolor zmieniony przez właściciela zostaje). Zmieniony wiersz dostaje wpis w changes (telefony po synchronizacji).
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'dict', `id`, 'update', NULL, json_object('id', `id`, 'createdAt', `created_at`, 'createdBy', `created_by`,
    'updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'deletedAt', `deleted_at`, 'rodzaj', `rodzaj`, 'wartosc', `wartosc`, 'kolejnosc', `kolejnosc`, 'grupa', `grupa`,
    'platne', CASE WHEN `platne` IS NULL THEN NULL ELSE json(CASE WHEN `platne` THEN 'true' ELSE 'false' END) END, 'kolor', '#c4501b', 'kategoria', `kategoria`, 'cyklMies', `cykl_mies`)
  FROM `dict` WHERE `rodzaj` = 'kategoria' AND `wartosc` = 'Fotowoltaika' AND lower(`kolor`) = '#c62828' AND `deleted_at` IS NULL;--> statement-breakpoint
UPDATE `dict` SET `kolor` = '#c4501b', `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE `rodzaj` = 'kategoria' AND `wartosc` = 'Fotowoltaika' AND lower(`kolor`) = '#c62828' AND `deleted_at` IS NULL;
