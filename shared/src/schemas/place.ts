import { z } from 'zod';
import { FORMY, RODZAJE_WPISU } from '../place.js';

const txt = z.string().trim();
const gr = z.number().int().min(0, 'Kwota nie może być ujemna');
const dzien = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data: RRRR-MM-DD');
const miesiac = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Miesiąc: RRRR-MM');
const op = { opId: z.string().min(1).optional() };

export const payrollPersonSchema = z.object({
  ...op,
  forma: z.enum(FORMY),
  umowaOd: dzien.nullable(),
  umowaDo: dzien.nullable(),
  bruttoGr: gr.nullable(),
  kosztRecznyGr: gr.nullable(),
  kupGr: gr.nullable(),
  urlopDni: z.number().min(0).max(40),
  etat: z.number().gt(0).max(1).nullable(),
  staz10: z.boolean(),
  uwagi: txt.max(500),
});
export type PayrollPerson = z.infer<typeof payrollPersonSchema>;

export const payrollRateCreateSchema = z.object({ ...op, personId: z.string().min(1), odMiesiaca: miesiac, stawkaGr: gr });
export type PayrollRateCreate = z.infer<typeof payrollRateCreateSchema>;
export const payrollRateUpdateSchema = z.object({ ...op, odMiesiaca: miesiac, stawkaGr: gr }).partial();
export type PayrollRateUpdate = z.infer<typeof payrollRateUpdateSchema>;

export const payrollMonthSchema = z.object({
  ...op,
  godziny: z.number().min(0).max(744).nullable(),
  kosztUmowyGr: gr.nullable(),
});
export type PayrollMonth = z.infer<typeof payrollMonthSchema>;

const wpis = { dzien: dzien.nullable(), rodzaj: z.enum(RODZAJE_WPISU), kwotaGr: z.number().int(), opis: txt.max(500) };
export const payrollEntryCreateSchema = z.object({ ...op, personId: z.string().min(1), miesiac, ...wpis, dzien: dzien.nullable().default(null), opis: txt.max(500).default('') });
export type PayrollEntryCreate = z.infer<typeof payrollEntryCreateSchema>;
export const payrollEntryUpdateSchema = z.object({ ...op, miesiac, ...wpis }).partial();
export type PayrollEntryUpdate = z.infer<typeof payrollEntryUpdateSchema>;

const ulamek = z.number().min(0).max(1);
export const parametrySchema = z.object({
  placaMinGr: gr, emP: ulamek, rentP: ulamek, chor: ulamek, zdr: ulamek, pit: ulamek, kwotaZmnGr: gr, kupGr: gr, kupZl: ulamek,
  emF: ulamek, rentF: ulamek, wyp: ulamek, fp: ulamek, fgsp: ulamek,
  godzDnia: z.number().min(1).max(24), urlopMin: z.number().min(0).max(40), urlopMax: z.number().min(0).max(40), godzUrlop: z.number().min(1).max(24),
});
export const parametryMapSchema = z.record(z.string().regex(/^\d{4}$/, 'Rok: RRRR'), parametrySchema);
