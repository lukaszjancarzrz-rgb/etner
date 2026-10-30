import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';

export const warehouseItems = sqliteTable('warehouse_items', {
  ...baseCols(),
  nazwa: text('nazwa').notNull(),
  ilosc: text('ilosc').notNull().default(''),
  by: text('by').notNull(),
  /** Zabrane z magazynu (ISO UTC) i przez kogo; null = leży na magazynie. */
  zabraneAt: text('zabrane_at'),
  zabraneBy: text('zabrane_by'),
});
