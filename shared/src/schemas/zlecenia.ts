import { z } from 'zod';
import { clientCreateSchema, siteInputSchema } from './klienci.js';

const txt = z.string().trim();

const fields = {
  opId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
  newClient: clientCreateSchema.omit({ opId: true, site: true }).optional(),
  siteId: z.string().min(1).nullish(),
  newSite: siteInputSchema.optional(),
  leadId: z.string().min(1).nullish(),
  rodzaj: txt,
  status: txt.min(1, 'Podaj status zlecenia'),
  kategoria: txt,
  /** Miesiąc realizacji, YYYY-MM. */
  termin: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Termin w formacie RRRR-MM').nullish(),
  ekipa: txt.min(1).nullish(),
  zakres: txt,
  uwagiAdmin: txt,
};

const defaults = { rodzaj: txt.default(''), kategoria: txt.default(''), zakres: txt.default(''), uwagiAdmin: txt.default('') };
export const jobCreateSchema = z.object({ ...fields, ...defaults }).refine((d) => d.clientId || d.newClient, { message: 'Wskaż klienta', path: ['clientId'] });
export type JobCreate = z.infer<typeof jobCreateSchema>;

export const jobUpdateSchema = z.object(fields).partial();
export type JobUpdate = z.infer<typeof jobUpdateSchema>;

/** Wejście zapisu: tworzenie (bez id) lub zmiana (z id). */
export type JobSaveInput = Partial<JobCreate> & { id?: string };
