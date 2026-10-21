import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols, firmy } from '../../core/schema-base.js';
import { clients, sites } from '../klienci/schema.js';

export const jobs = sqliteTable('jobs', {
  ...baseCols(),
  firmaId: text('firma_id').notNull().references(() => firmy.id),
  numer: text('numer').notNull(),
  clientId: text('client_id').notNull().references(() => clients.id),
  siteId: text('site_id').references(() => sites.id),
  /** Lead z modułu leadów (zadanie 11); na razie bez klucza obcego. */
  leadId: text('lead_id'),
  rodzaj: text('rodzaj').notNull().default(''),
  status: text('status').notNull(),
  kategoria: text('kategoria').notNull().default(''),
  /** Miesiąc YYYY-MM. */
  termin: text('termin'),
  ekipa: text('ekipa'),
  zakres: text('zakres').notNull().default(''),
  uwagiAdmin: text('uwagi_admin').notNull().default(''),
  zamknieteAt: text('zamkniete_at'),
});
