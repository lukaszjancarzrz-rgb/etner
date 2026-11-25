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
  /** Numer seryjny, numer faktury zakupu, data zakupu (RRRR-MM-DD) – właściciel 2026-11-24. */
  sn: text('sn').notNull().default(''),
  faktura: text('faktura').notNull().default(''),
  dataZakupu: text('data_zakupu'),
  by: text('by').notNull(),
});

/** Historia serwisowa narzędzia: dzień (RRRR-MM-DD) i czynność (właściciel 2026-11-25). */
export const toolService = sqliteTable('tool_service', {
  ...baseCols(),
  toolId: text('tool_id').notNull().references(() => tools.id),
  dzien: text('dzien').notNull(),
  czynnosc: text('czynnosc').notNull(),
  by: text('by').notNull(),
});
