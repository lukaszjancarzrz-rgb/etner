import { z } from 'zod';
import { addDays, addMonths } from '../dates.js';

/** Cykl zadania cyklicznego: po „Zrobione” termin = dziś + cykl. */
export const CYKLE = { '1t': 'co tydzień', '2t': 'co 2 tygodnie', '1m': 'co miesiąc', '3m': 'co 3 miesiące', '6m': 'co pół roku', '1r': 'co rok' } as const;
export type Cykl = keyof typeof CYKLE;
export const nextTermin = (today: string, cykl: Cykl): string =>
  cykl === '1t' ? addDays(today, 7) : cykl === '2t' ? addDays(today, 14) : addMonths(today, { '1m': 1, '3m': 3, '6m': 6, '1r': 12 }[cykl]);

const txt = z.string().trim();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data w formacie RRRR-MM-DD');

const fields = {
  opId: z.string().min(1).optional(),
  tekst: txt.min(1, 'Wpisz treść zadania').max(500, 'Tekst jest za długi'),
  priorytet: z.number().int().min(1).max(9).nullable(),
  grupa: txt,
  status: txt.min(1),
  termin: day.nullable(),
  cykliczne: z.boolean(),
  cykl: z.enum(Object.keys(CYKLE) as [Cykl, ...Cykl[]]).nullable(),
  clientId: z.string().min(1).nullable(),
  uwagi: txt,
};
export const taskCreateSchema = z.object({
  ...fields,
  priorytet: fields.priorytet.default(null),
  grupa: fields.grupa.default(''),
  status: fields.status.optional(),
  termin: fields.termin.default(null),
  cykliczne: fields.cykliczne.default(false),
  cykl: fields.cykl.default(null),
  clientId: fields.clientId.default(null),
  uwagi: fields.uwagi.default(''),
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z.object(fields).partial();
export type TaskSaveInput = Partial<TaskCreate> & { id?: string };
