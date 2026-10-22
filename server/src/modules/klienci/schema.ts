import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols, firmy } from '../../core/schema-base.js';

export const clients = sqliteTable('clients', {
  ...baseCols(),
  firmaId: text('firma_id').notNull().references(() => firmy.id),
  typ: text('typ', { enum: ['osoba', 'firma'] }).notNull(),
  nazwa: text('nazwa').notNull(),
  telefony: text('telefony', { mode: 'json' }).$type<string[]>().notNull().default([]),
  emaile: text('emaile', { mode: 'json' }).$type<string[]>().notNull().default([]),
  nip: text('nip').notNull().default(''),
  notatki: text('notatki').notNull().default(''),
  /** Znormalizowany tekst do wyszukiwania (nazwa, telefony, e-maile, adresy obiektów). */
  szukaj: text('szukaj').notNull().default(''),
});

export const sites = sqliteTable('sites', {
  ...baseCols(),
  clientId: text('client_id').notNull().references(() => clients.id),
  nazwa: text('nazwa').notNull().default(''),
  adres: text('adres').notNull().default(''),
  miejscowosc: text('miejscowosc').notNull().default(''),
  mapa: text('mapa').notNull().default(''),
  opis: text('opis').notNull().default(''),
  szukaj: text('szukaj').notNull().default(''),
});
