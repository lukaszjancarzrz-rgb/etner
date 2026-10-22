import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';
import { clients } from '../klienci/schema.js';

/** `termin`, `ostatnio`: YYYY-MM-DD albo null. */
export const tasks = sqliteTable('tasks', {
  ...baseCols(),
  tekst: text('tekst').notNull(),
  priorytet: integer('priorytet'),
  grupa: text('grupa').notNull().default(''),
  status: text('status').notNull(),
  termin: text('termin'),
  cykliczne: integer('cykliczne', { mode: 'boolean' }).notNull().default(false),
  ostatnio: text('ostatnio'),
  /** Cykl (CYKLE ze shared) albo null: cykliczne bez cyklu nie zmienia terminu. */
  cykl: text('cykl'),
  clientId: text('client_id').references(() => clients.id),
  uwagi: text('uwagi').notNull().default(''),
});
