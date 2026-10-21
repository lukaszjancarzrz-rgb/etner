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

/** owner_type NULL = plik wgrany, ale jeszcze niepodpięty do wpisu. */
export const attachments = sqliteTable('attachments', {
  ...baseCols(),
  ownerType: text('owner_type', { enum: ['entry', 'scope', 'device', 'service'] }),
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
});
