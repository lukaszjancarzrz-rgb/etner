import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols, firmy } from '../../core/schema-base.js';
import { clients, sites } from '../klienci/schema.js';

/** Daty `nastepny`, `ostatni`: YYYY-MM-DD albo '' (brak). */
export const leads = sqliteTable('leads', {
  ...baseCols(),
  firmaId: text('firma_id').notNull().references(() => firmy.id),
  numer: text('numer').notNull(),
  clientId: text('client_id').references(() => clients.id),
  siteId: text('site_id').references(() => sites.id),
  status: text('status').notNull(),
  kategoria: text('kategoria').notNull().default(''),
  temat: text('temat').notNull(),
  zrodlo: text('zrodlo').notNull().default(''),
  opis: text('opis').notNull().default(''),
  wartoscGr: integer('wartosc_gr'),
  nastepny: text('nastepny').notNull().default(''),
  ostatni: text('ostatni').notNull().default(''),
  uwagi: text('uwagi').notNull().default(''),
  zamknieteAt: text('zamkniete_at'),
});

export const leadContacts = sqliteTable('lead_contacts', {
  ...baseCols(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  dzien: text('dzien').notNull(),
  /** Termin, który kontakt zrealizował (stary `nastepny`), albo ''. */
  plan: text('plan').notNull().default(''),
  notatka: text('notatka').notNull(),
  nastepny: text('nastepny').notNull().default(''),
  status: text('status').notNull(),
  by: text('by').notNull(),
});
