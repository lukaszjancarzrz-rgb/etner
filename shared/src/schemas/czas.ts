import { z } from 'zod';

const txt = z.string().trim();
const iso = z.string().refine((s) => /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s)), 'Nieprawidłowa godzina');
const op = { opId: z.string().min(1).optional() };
const jobId = z.string().min(1).nullable();

export const timeStartSchema = z.object({ ...op, at: iso, jobId });
export type TimeStart = z.infer<typeof timeStartSchema>;
/** Stop trwającego wpisu; od/do = godziny poprawione w oknie potwierdzenia. */
export const timeStopSchema = z.object({ ...op, at: iso, od: iso.optional(), do: iso.optional(), komentarz: txt.max(300).optional() });
export type TimeStop = z.infer<typeof timeStopSchema>;
/** Wpis ręczny; personId tylko admin (dla innej osoby). */
export const timeEntryCreateSchema = z.object({ ...op, jobId, od: iso, do: iso, komentarz: txt.max(300).default(''), personId: z.string().min(1).optional() });
export type TimeEntryCreate = z.infer<typeof timeEntryCreateSchema>;
export const timeEntryUpdateSchema = z.object({ ...op, jobId, od: iso, do: iso, komentarz: txt.max(300) }).partial();
export type TimeEntryUpdate = z.infer<typeof timeEntryUpdateSchema>;
