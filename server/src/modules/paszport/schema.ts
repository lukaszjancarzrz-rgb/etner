import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';
import { sites } from '../klienci/schema.js';

/** Paszport obiektu: numer PSZ-RRRR-NNN i link publiczny (token jawnie, R65; null = brak linku). */
export const passports = sqliteTable('passports', {
  ...baseCols(),
  siteId: text('site_id').notNull().references(() => sites.id),
  numer: text('numer').notNull(),
  token: text('token'),
  tokenAt: text('token_at'),
}, (t) => [uniqueIndex('passports_site').on(t.siteId).where(sql`deleted_at IS NULL`)]);

/** Teczka = (obiekt, kategoria); wiersz dopiero przy pierwszym zapisie (P1, P2). */
export const passportFolders = sqliteTable('passport_folders', {
  ...baseCols(),
  siteId: text('site_id').notNull().references(() => sites.id),
  /** Wartość słownika `kategoria`. */
  kategoria: text('kategoria').notNull(),
  /** RRRR-MM-DD; null = bez terminu. */
  nastepnySerwis: text('nastepny_serwis'),
  cyklMies: integer('cykl_mies'),
  przypomnienia: integer('przypomnienia', { mode: 'boolean' }).notNull().default(true),
  /** Termin serwisu, dla którego wysłano przypomnienie 30 / 7 dni. */
  wyslano30Dla: text('wyslano_30_dla'),
  wyslano7Dla: text('wyslano_7_dla'),
  /** Tylko admin (P6). */
  notatkaRozliczenie: text('notatka_rozliczenie').notNull().default(''),
}, (t) => [uniqueIndex('passport_folders_site_kat').on(t.siteId, t.kategoria).where(sql`deleted_at IS NULL`)]);

export const devices = sqliteTable('devices', {
  ...baseCols(),
  folderId: text('folder_id').notNull().references(() => passportFolders.id),
  nazwa: text('nazwa').notNull(),
  producent: text('producent').notNull().default(''),
  model: text('model').notNull().default(''),
  nrSeryjny: text('nr_seryjny').notNull().default(''),
  /** RRRR-MM-DD. */
  montaz: text('montaz'),
  jobId: text('job_id'),
  gwarancjaDo: text('gwarancja_do'),
  uwagi: text('uwagi').notNull().default(''),
  dlaKlienta: integer('dla_klienta', { mode: 'boolean' }).notNull().default(true),
});

/** Wpis karty serwisowej (P10); zdjęcia w `attachments` (owner_type 'service'). */
export const serviceEntries = sqliteTable('service_entries', {
  ...baseCols(),
  folderId: text('folder_id').notNull().references(() => passportFolders.id),
  dzien: text('dzien').notNull(),
  jobId: text('job_id'),
  czynnosci: text('czynnosci', { mode: 'json' }).$type<string[]>().notNull().default([]),
  uwagi: text('uwagi').notNull().default(''),
  authorId: text('author_id').notNull(),
  dlaKlienta: integer('dla_klienta', { mode: 'boolean' }).notNull().default(true),
});
