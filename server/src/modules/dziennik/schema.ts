import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';

/** Wpis dziennika zlecenia albo leada; author_id NULL = wpis systemowy. */
export const diaryEntries = sqliteTable('diary_entries', {
  ...baseCols(),
  ownerType: text('owner_type', { enum: ['job', 'lead'] }).notNull(),
  ownerId: text('owner_id').notNull(),
  authorId: text('author_id'),
  tekst: text('tekst').notNull(),
  dlaKlienta: integer('dla_klienta', { mode: 'boolean' }).notNull().default(false),
});

/** owner_type NULL = plik wgrany, ale jeszcze niepodpięty do wpisu; `teczka` = plik dodany w teczce paszportu (owner_id = passport_folders.id). */
export const attachments = sqliteTable('attachments', {
  ...baseCols(),
  ownerType: text('owner_type', { enum: ['entry', 'scope', 'device', 'service', 'teczka'] }),
  ownerId: text('owner_id'),
  rodzaj: text('rodzaj', { enum: ['zdjecie', 'plik'] }).notNull(),
  keyOrig: text('key_orig').notNull(),
  keyView: text('key_view'),
  keyThumb: text('key_thumb'),
  nazwa: text('nazwa').notNull(),
  mime: text('mime').notNull(),
  bajty: integer('bajty').notNull(),
  w: integer('w'),
  h: integer('h'),
  dlaKlienta: integer('dla_klienta', { mode: 'boolean' }).notNull().default(false),
  authorId: text('author_id').notNull(),
  /** Typ dokumentu (moduł 2); `faktura` widzi tylko admin. */
  typDok: text('typ_dok', { enum: ['faktura', 'projekt', 'oferta', 'instrukcja', 'inne'] }),
});
