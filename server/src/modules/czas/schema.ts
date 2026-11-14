import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { ZRODLA_CZASU } from '@etner/shared';
import { baseCols } from '../../core/schema-base.js';

/** Czasomierz: wpis czasu pracy osoby (ISO UTC). od_cz/do_cz = czasy z czasomierza (null przy wpisie ręcznym); do = null – trwa. */
export const timeEntries = sqliteTable('time_entries', {
  ...baseCols(),
  userId: text('user_id'),
  personId: text('person_id').notNull(),
  jobId: text('job_id'),
  dzien: text('dzien').notNull(),
  od: text('od').notNull(),
  do: text('do'),
  odCz: text('od_cz'),
  doCz: text('do_cz'),
  zrodlo: text('zrodlo', { enum: ZRODLA_CZASU }).notNull(),
  autoStop: integer('auto_stop', { mode: 'boolean' }).notNull().default(false),
  przypomnianoAt: text('przypomniano_at'),
  edytowal: text('edytowal'),
  edytowalAt: text('edytowal_at'),
  komentarz: text('komentarz').notNull().default(''),
}, (t) => [index('time_entries_person_dzien').on(t.personId, t.dzien), index('time_entries_user').on(t.userId)]);
