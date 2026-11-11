import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols } from '../../core/schema-base.js';

/** Przychody (kwoty w groszach); nettoGr, vatGr i miesiac zawsze liczy serwer. */
export const revenues = sqliteTable('revenues', {
  ...baseCols(),
  jobId: text('job_id'),
  kategoria: text('kategoria'),
  klient: text('klient').notNull().default(''),
  miejscowosc: text('miejscowosc').notNull().default(''),
  opis: text('opis').notNull().default(''),
  sposob: text('sposob').notNull(),
  kwotaGr: integer('kwota_gr').notNull(),
  nettoGr: integer('netto_gr').notNull(),
  vatGr: integer('vat_gr').notNull(),
  dzien: text('dzien'),
  innyMiesiac: text('inny_miesiac'),
  miesiac: text('miesiac'),
  nrFaktury: text('nr_faktury').notNull().default(''),
  materialyGr: integer('materialy_gr'),
  uwagi: text('uwagi').notNull().default(''),
  by: text('by').notNull(),
});

export const costs = sqliteTable('costs', {
  ...baseCols(),
  dzien: text('dzien').notNull(),
  miesiac: text('miesiac').notNull(),
  nrDokumentu: text('nr_dokumentu').notNull().default(''),
  kontrahent: text('kontrahent').notNull().default(''),
  nip: text('nip').notNull().default(''),
  opis: text('opis').notNull().default(''),
  kategoria: text('kategoria').notNull(),
  nettoGr: integer('netto_gr').notNull(),
  kolumnaKpir: integer('kolumna_kpir').notNull(),
  doWyniku: integer('do_wyniku', { mode: 'boolean' }).notNull().default(true),
  uwagi: text('uwagi').notNull().default(''),
  by: text('by').notNull(),
});

/** Sumy z KPiR za miesiąc (do porównania z zaimportowanymi kosztami). */
export const kpirMonths = sqliteTable('kpir_months', {
  ...baseCols(),
  miesiac: text('miesiac').notNull().unique(),
  przychodGr: integer('przychod_gr').notNull(),
  towaryGr: integer('towary_gr').notNull(),
  uboczneGr: integer('uboczne_gr').notNull(),
  wynagrodzeniaGr: integer('wynagrodzenia_gr').notNull(),
  pozostaleGr: integer('pozostale_gr').notNull(),
});
