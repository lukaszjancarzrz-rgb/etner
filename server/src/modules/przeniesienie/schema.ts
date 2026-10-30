import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';

/**
 * Pozycje „do przejrzenia” po przeniesieniu danych ze starego arkusza (R51). `co` = czego dotyczy (zlecenia, harmonogram, …),
 * `dzien` / `osoba` / `tekst` – komórka harmonogramu albo wiersz, `pominiete` = nie przeniesiono, `przejrzane` = odhaczone przez admina.
 */
export const migrationReview = sqliteTable('migration_review', {
  ...baseCols(),
  co: text('co').notNull(),
  arkusz: text('arkusz').notNull(),
  wiersz: integer('wiersz'),
  dzien: text('dzien'),
  osoba: text('osoba').notNull().default(''),
  tekst: text('tekst').notNull().default(''),
  opis: text('opis').notNull(),
  ile: integer('ile').notNull().default(1),
  pominiete: integer('pominiete', { mode: 'boolean' }).notNull().default(false),
  przejrzane: integer('przejrzane', { mode: 'boolean' }).notNull().default(false),
});
