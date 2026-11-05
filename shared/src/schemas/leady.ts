import { z } from 'zod';
import { clientCreateSchema, siteInputSchema } from './klienci.js';
import { jobUpdateSchema } from './zlecenia.js';

const txt = z.string().trim();
const day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Data w formacie RRRR-MM-DD');

const fields = {
  opId: z.string().min(1).optional(),
  clientId: z.string().min(1).nullish(),
  newClient: clientCreateSchema.omit({ opId: true, site: true }).optional(),
  siteId: z.string().min(1).nullish(),
  newSite: siteInputSchema.optional(),
  status: txt.min(1, 'Podaj status leada'),
  kategoria: txt,
  temat: txt.min(1, 'Podaj temat leada'),
  zrodlo: txt,
  opis: txt,
  /** Wartość w groszach. */
  wartoscGr: z.number().int().min(0).max(100_000_000_00, 'Maksymalnie 100 000 000,00 zł').nullish(),
  nastepny: day,
  uwagi: txt,
};

// Wartości domyślne tylko przy tworzeniu (zod 4: .partial() z default nadpisałby zapisane pole).
const defaults = { kategoria: txt.default(''), zrodlo: txt.default(''), opis: txt.default(''), nastepny: day.default(''), uwagi: txt.default('') };
export const leadCreateSchema = z.object({ ...fields, ...defaults, status: fields.status.optional() });
export type LeadCreate = z.infer<typeof leadCreateSchema>;

export const leadUpdateSchema = z.object(fields).partial();
export type LeadUpdate = z.infer<typeof leadUpdateSchema>;
export type LeadSaveInput = Partial<LeadCreate> & { id?: string };

export const leadContactSchema = z.object({
  opId: z.string().min(1).optional(),
  notatka: txt.min(1, 'Wpisz notatkę z kontaktu'),
  nastepny: day.optional(),
});

export const leadToJobSchema = z.object({
  opId: z.string().min(1).optional(),
  accept: z.boolean().default(false),
  job: jobUpdateSchema.omit({ opId: true, leadId: true }),
  /** Treść pierwszego punktu zakresu prac (np. opis leada); pusty = bez punktu. */
  scope: txt.max(5000, 'Tekst jest za długi').default(''),
});
export type LeadToJob = z.infer<typeof leadToJobSchema>;

