import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';

export const shopping = sqliteTable('shopping', {
  ...baseCols(),
  co: text('co').notNull(),
  status: text('status').notNull(),
  uwagi: text('uwagi').notNull().default(''),
  by: text('by').notNull(),
  kupioneAt: text('kupione_at'),
  kupioneBy: text('kupione_by'),
});
