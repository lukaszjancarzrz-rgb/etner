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

/** Listy predefiniowane (18j): pozycje w kolejności; odhaczanie tylko na urządzeniu. */
export const checklistTemplates = sqliteTable('checklist_templates', {
  ...baseCols(),
  nazwa: text('nazwa').notNull(),
  kategorie: text('kategorie', { mode: 'json' }).$type<string[]>().notNull().default([]),
  rodzaje: text('rodzaje', { mode: 'json' }).$type<string[]>().notNull().default([]),
  pozycje: text('pozycje', { mode: 'json' }).$type<string[]>().notNull().default([]),
  kolejnosc: integer('kolejnosc').notNull().default(0),
});
