import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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
  /** Prywatny kanał Pumble zlecenia (zadanie 18g); brak = jeszcze nie założony. */
  pumbleChannelId: text('pumble_channel_id'),
});

/** Punkt zakresu prac zlecenia; zdjęcia w `attachments` (owner_type 'scope', owner_id = id punktu). */
export const jobScopeItems = sqliteTable('job_scope_items', {
  ...baseCols(),
  jobId: text('job_id').notNull().references(() => jobs.id),
  kolejnosc: integer('kolejnosc').notNull(),
  tekst: text('tekst').notNull(),
});

/** Ostatnie wiadomości kanału Pumble zlecenia (najwyżej 50 żywych na zlecenie). */
export const pumbleMessages = sqliteTable('pumble_messages', {
  ...baseCols(),
  jobId: text('job_id').notNull().references(() => jobs.id),
  messageId: text('message_id').notNull().unique(),
  authorName: text('author_name').notNull(),
  text: text('text').notNull(),
  /** ISO UTC. */
  sentAt: text('sent_at').notNull(),
  threadRootId: text('thread_root_id'),
  /** JSON {files, attachments?}: surowe dane plików z Pumble; null = bez plików. */
  files: text('files'),
});
