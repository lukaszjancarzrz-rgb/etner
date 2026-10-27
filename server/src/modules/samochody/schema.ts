import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';

export const cars = sqliteTable('cars', {
  ...baseCols(),
  nazwa: text('nazwa').notNull(),
  /** Wartość słownika `ekipa`; null = bez przypisania. */
  ekipa: text('ekipa'),
  kolejnosc: integer('kolejnosc').notNull().default(0),
});

export const carFaults = sqliteTable('car_faults', {
  ...baseCols(),
  carId: text('car_id').notNull().references(() => cars.id),
  opis: text('opis').notNull(),
  by: text('by').notNull(),
  /** Dzień naprawy (RRRR-MM-DD, admin); null = bez terminu. */
  naprawaDzien: text('naprawa_dzien'),
});
