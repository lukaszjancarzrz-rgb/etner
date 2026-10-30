import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';
import { cars } from '../samochody/schema.js';

export const tools = sqliteTable('tools', {
  ...baseCols(),
  nazwa: text('nazwa').notNull(),
  /** Samochód (R42: nazwa miejsca = nazwa auta); null = Magazyn. */
  carId: text('car_id').references(() => cars.id),
  /** Miejsce w samochodzie (PODMIEJSCA); w Magazynie null. */
  podmiejsce: text('podmiejsce'),
  by: text('by').notNull(),
});
