import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';
import { schedulePeople } from '../uzytkownicy/schema.js';

/** Wpis harmonogramu: osoba × dzień (YYYY-MM-DD) × slot 0|1 (dwa sloty tylko po pół dnia). */
export const scheduleEntries = sqliteTable('schedule_entries', {
  ...baseCols(),
  dzien: text('dzien').notNull(),
  personId: text('person_id').notNull().references(() => schedulePeople.id),
  rodzaj: text('rodzaj', { enum: ['zlecenie', 'kod', 'tekst'] }).notNull(),
  jobId: text('job_id'),
  kod: text('kod'),
  tekst: text('tekst'),
  polDnia: integer('pol_dnia', { mode: 'boolean' }).notNull().default(false),
  slot: integer('slot').notNull().default(0),
}, (t) => [uniqueIndex('schedule_entries_cell').on(t.dzien, t.personId, t.slot).where(sql`deleted_at IS NULL`)]);

export const scheduleNotes = sqliteTable('schedule_notes', {
  ...baseCols(),
  dzien: text('dzien').notNull(),
  tekst: text('tekst').notNull(),
}, (t) => [uniqueIndex('schedule_notes_day').on(t.dzien).where(sql`deleted_at IS NULL`)]);

/** Szkic admina; person_id = null oznacza uwagę dnia. `proposal` = pełna docelowa komórka. */
export const scheduleDrafts = sqliteTable('schedule_drafts', {
  ...baseCols(),
  dzien: text('dzien').notNull(),
  personId: text('person_id'),
  proposal: text('proposal', { mode: 'json' }).notNull(),
  by: text('by').notNull(),
  at: text('at').notNull(),
});
