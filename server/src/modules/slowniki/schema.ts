import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';

export const dict = sqliteTable('dict', {
  ...baseCols(),
  rodzaj: text('rodzaj').notNull(),
  wartosc: text('wartosc').notNull(),
  kolejnosc: integer('kolejnosc').notNull(),
  grupa: text('grupa', { enum: ['aktualne', 'pozniej', 'zamkniete'] }),
  platne: integer('platne', { mode: 'boolean' }),
  kolor: text('kolor'),
  /** Rodzaj `czynnosc_serwisowa`: wartość słownika `kategoria`, do której należy czynność. */
  kategoria: text('kategoria'),
  /** Rodzaj `kategoria`: domyślny cykl serwisu teczki w miesiącach (R67); null = bez cyklu. */
  cyklMies: integer('cykl_mies'),
});
