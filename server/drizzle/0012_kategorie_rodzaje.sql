-- 18f: kategoria = Elektryka, Fotowoltaika, Rekuperacja, Klimatyzacja, Inne (z kolorami); rodzaj_zlecenia = montaż, przygotówka, serwis, inne.
-- Zlecenia i leady z usuniętymi wartościami -> 'Inne'/'inne'. Każdy zmieniony wiersz dostaje wpis w changes (telefony po synchronizacji).
-- updated_at zleceń i leadów zostaje: to porządek słownika, nie zmiana do pokazania jako „nowe”.
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'jobs', `id`, 'update', NULL, json_object('id', `id`, 'createdAt', `created_at`, 'createdBy', `created_by`, 'updatedAt', `updated_at`, 'deletedAt', NULL,
    'firmaId', `firma_id`, 'numer', `numer`, 'clientId', `client_id`, 'siteId', `site_id`, 'leadId', `lead_id`,
    'rodzaj', CASE WHEN `rodzaj` = 'gwarancja' THEN 'inne' ELSE `rodzaj` END, 'status', `status`,
    'kategoria', CASE WHEN `kategoria` IN ('Pompa ciepła', 'Serwis') THEN 'Inne' ELSE `kategoria` END,
    'termin', `termin`, 'ekipa', `ekipa`, 'zakres', `zakres`, 'uwagiAdmin', `uwagi_admin`, 'zamknieteAt', `zamkniete_at`)
  FROM `jobs` WHERE `deleted_at` IS NULL AND (`kategoria` IN ('Pompa ciepła', 'Serwis') OR `rodzaj` = 'gwarancja');--> statement-breakpoint
UPDATE `jobs` SET `kategoria` = 'Inne' WHERE `kategoria` IN ('Pompa ciepła', 'Serwis') AND `deleted_at` IS NULL;--> statement-breakpoint
UPDATE `jobs` SET `rodzaj` = 'inne' WHERE `rodzaj` = 'gwarancja' AND `deleted_at` IS NULL;--> statement-breakpoint
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'leads', `id`, 'update', NULL, json_object('id', `id`, 'createdAt', `created_at`, 'createdBy', `created_by`, 'updatedAt', `updated_at`, 'deletedAt', NULL,
    'firmaId', `firma_id`, 'numer', `numer`, 'clientId', `client_id`, 'siteId', `site_id`, 'status', `status`, 'kategoria', 'Inne',
    'temat', `temat`, 'zrodlo', `zrodlo`, 'opis', `opis`, 'wartoscGr', `wartosc_gr`, 'nastepny', `nastepny`, 'ostatni', `ostatni`, 'uwagi', `uwagi`, 'zamknieteAt', `zamkniete_at`)
  FROM `leads` WHERE `deleted_at` IS NULL AND `kategoria` IN ('Pompa ciepła', 'Serwis');--> statement-breakpoint
UPDATE `leads` SET `kategoria` = 'Inne' WHERE `kategoria` IN ('Pompa ciepła', 'Serwis') AND `deleted_at` IS NULL;--> statement-breakpoint
-- Słownik: usunięte wartości miękko (wpis tylko dla usuwanych teraz).
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'dict', `id`, 'delete', NULL, json_object('id', `id`, 'rodzaj', `rodzaj`, 'wartosc', `wartosc`, 'deletedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  FROM `dict` WHERE `deleted_at` IS NULL AND ((`rodzaj` = 'kategoria' AND `wartosc` IN ('Pompa ciepła', 'Serwis')) OR (`rodzaj` = 'rodzaj_zlecenia' AND `wartosc` = 'gwarancja'));--> statement-breakpoint
UPDATE `dict` SET `deleted_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now'), `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE `deleted_at` IS NULL AND ((`rodzaj` = 'kategoria' AND `wartosc` IN ('Pompa ciepła', 'Serwis')) OR (`rodzaj` = 'rodzaj_zlecenia' AND `wartosc` = 'gwarancja'));--> statement-breakpoint
-- Brakujące wartości docelowe; tylko gdy słownik już ma wiersze (pustą bazę wypełnia seedBase po migracjach).
INSERT INTO `dict` (`id`, `created_at`, `created_by`, `updated_at`, `deleted_at`, `rodzaj`, `wartosc`, `kolejnosc`, `grupa`, `platne`, `kolor`)
  WITH t(rodzaj, wartosc) AS (VALUES ('kategoria', 'Elektryka'), ('kategoria', 'Fotowoltaika'), ('kategoria', 'Rekuperacja'), ('kategoria', 'Klimatyzacja'), ('kategoria', 'Inne'),
    ('rodzaj_zlecenia', 'montaż'), ('rodzaj_zlecenia', 'przygotówka'), ('rodzaj_zlecenia', 'serwis'), ('rodzaj_zlecenia', 'inne'))
  SELECT '0' || substr(upper(hex(randomblob(13))), 1, 25), strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, t.rodzaj, t.wartosc, 0, NULL, NULL, NULL FROM t
  WHERE EXISTS (SELECT 1 FROM `dict` d WHERE d.`rodzaj` = t.rodzaj)
    AND NOT EXISTS (SELECT 1 FROM `dict` d WHERE d.`rodzaj` = t.rodzaj AND d.`wartosc` = t.wartosc AND d.`deleted_at` IS NULL);--> statement-breakpoint
-- Kolejność i kolory wartości docelowych (wartości dodane przez admina zostają za nimi).
UPDATE `dict` SET
  `kolejnosc` = CASE `wartosc` WHEN 'Elektryka' THEN 0 WHEN 'Fotowoltaika' THEN 1 WHEN 'Rekuperacja' THEN 2 WHEN 'Klimatyzacja' THEN 3 WHEN 'Inne' THEN 4 END,
  `kolor` = CASE `wartosc` WHEN 'Elektryka' THEN '#0070ab' WHEN 'Fotowoltaika' THEN '#c62828' WHEN 'Rekuperacja' THEN '#2e7d32' WHEN 'Klimatyzacja' THEN '#7b1fa2' WHEN 'Inne' THEN '#f9a825' END,
  `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE `rodzaj` = 'kategoria' AND `deleted_at` IS NULL AND `wartosc` IN ('Elektryka', 'Fotowoltaika', 'Rekuperacja', 'Klimatyzacja', 'Inne');--> statement-breakpoint
UPDATE `dict` SET `kolejnosc` = CASE `wartosc` WHEN 'montaż' THEN 0 WHEN 'przygotówka' THEN 1 WHEN 'serwis' THEN 2 WHEN 'inne' THEN 3 END, `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE `rodzaj` = 'rodzaj_zlecenia' AND `deleted_at` IS NULL AND `wartosc` IN ('montaż', 'przygotówka', 'serwis', 'inne');--> statement-breakpoint
UPDATE `dict` SET `kolejnosc` = `kolejnosc` + 10, `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE `deleted_at` IS NULL AND ((`rodzaj` = 'kategoria' AND `wartosc` NOT IN ('Elektryka', 'Fotowoltaika', 'Rekuperacja', 'Klimatyzacja', 'Inne'))
    OR (`rodzaj` = 'rodzaj_zlecenia' AND `wartosc` NOT IN ('montaż', 'przygotówka', 'serwis', 'inne')));--> statement-breakpoint
INSERT INTO `changes` (`at`, `user_id`, `entity`, `entity_id`, `action`, `before`, `after`)
  SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 'dict', `id`, 'update', NULL, json_object('id', `id`, 'createdAt', `created_at`, 'createdBy', `created_by`, 'updatedAt', `updated_at`, 'deletedAt', NULL,
    'rodzaj', `rodzaj`, 'wartosc', `wartosc`, 'kolejnosc', `kolejnosc`, 'grupa', `grupa`, 'platne', CASE WHEN `platne` IS NULL THEN NULL ELSE json(CASE WHEN `platne` THEN 'true' ELSE 'false' END) END, 'kolor', `kolor`)
  FROM `dict` WHERE `deleted_at` IS NULL AND `rodzaj` IN ('kategoria', 'rodzaj_zlecenia');
