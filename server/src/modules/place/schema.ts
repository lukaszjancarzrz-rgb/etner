import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { FORMY, RODZAJE_WPISU } from '@etner/shared';
import { baseCols } from '../../core/schema-base.js';
import { schedulePeople } from '../uzytkownicy/schema.js';

/** Płace: osoba = wpis z harmonogramu; kwoty w groszach, miesiące RRRR-MM, daty RRRR-MM-DD. */
export const payrollPeople = sqliteTable('payroll_people', {
  ...baseCols(),
  personId: text('person_id').notNull().references(() => schedulePeople.id),
  forma: text('forma', { enum: FORMY }).notNull().default('brak'),
  umowaOd: text('umowa_od'),
  umowaDo: text('umowa_do'),
  bruttoGr: integer('brutto_gr'),
  kosztRecznyGr: integer('koszt_reczny_gr'),
  kupGr: integer('kup_gr'),
  urlopDni: real('urlop_dni').notNull().default(0),
  etat: real('etat'),
  staz10: integer('staz10', { mode: 'boolean' }).notNull().default(false),
  uwagi: text('uwagi').notNull().default(''),
}, (t) => [uniqueIndex('payroll_people_person').on(t.personId).where(sql`deleted_at IS NULL`)]);

/** Historia stawki godzinowej: obowiązuje od miesiąca do następnej zmiany. */
export const payrollRates = sqliteTable('payroll_rates', {
  ...baseCols(),
  personId: text('person_id').notNull(),
  odMiesiaca: text('od_miesiaca').notNull(),
  stawkaGr: integer('stawka_gr').notNull(),
});

export const payrollMonths = sqliteTable('payroll_months', {
  ...baseCols(),
  personId: text('person_id').notNull(),
  miesiac: text('miesiac').notNull(),
  godziny: real('godziny'),
  kosztUmowyGr: integer('koszt_umowy_gr'),
}, (t) => [uniqueIndex('payroll_months_cell').on(t.personId, t.miesiac).where(sql`deleted_at IS NULL`)]);

export const payrollEntries = sqliteTable('payroll_entries', {
  ...baseCols(),
  personId: text('person_id').notNull(),
  miesiac: text('miesiac').notNull(),
  dzien: text('dzien'),
  rodzaj: text('rodzaj', { enum: RODZAJE_WPISU }).notNull(),
  kwotaGr: integer('kwota_gr').notNull(),
  opis: text('opis').notNull().default(''),
});
