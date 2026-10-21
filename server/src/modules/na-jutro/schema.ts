import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';

/** Lista „na jutro” ekipy; `dzien` to YYYY-MM-DD. */
export const checklists = sqliteTable('checklists', {
  ...baseCols(),
  ekipa: text('ekipa').notNull(),
  dzien: text('dzien').notNull(),
  tekst: text('tekst').notNull(),
  zabrane: integer('zabrane', { mode: 'boolean' }).notNull().default(false),
  zabraneBy: text('zabrane_by'),
  zabraneAt: text('zabrane_at'),
});
