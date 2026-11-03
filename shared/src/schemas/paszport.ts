import { z } from 'zod';
import { TYP_DOK } from '../stale.js';

const txt = z.string().trim();
const opId = z.string().min(1).optional();
const realDay = (d: string) => { const t = Date.parse(`${d}T12:00:00Z`); return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d; };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data w formacie RRRR-MM-DD').refine(realDay, 'Nie ma takiego dnia');
const teczka = { siteId: z.string().min(1, 'Wybierz obiekt'), kategoria: txt.min(1, 'Wybierz kategorię') };
const opt = (max: number) => txt.max(max, 'Tekst jest za długi').optional();

/** Ręczne „Dodaj teczkę” (admin). */
export const folderCreateSchema = z.object({ opId, ...teczka });
export type FolderCreate = z.infer<typeof folderCreateSchema>;
/** notatkaRozliczenie – tylko admin. */
export const folderUpdateSchema = z.object({
  opId,
  nastepnySerwis: day.nullable().optional(),
  cyklMies: z.number().int().min(1).max(120).nullable().optional(),
  przypomnienia: z.boolean().optional(),
  notatkaRozliczenie: txt.max(5000, 'Notatka jest za długa').optional(),
});
export type FolderUpdate = z.infer<typeof folderUpdateSchema>;

const deviceFields = {
  nazwa: txt.min(1, 'Wpisz nazwę urządzenia').max(200, 'Nazwa jest za długa'),
  producent: opt(200), model: opt(200), nrSeryjny: opt(200),
  montaz: day.nullable().optional(), jobId: z.string().min(1).nullable().optional(), gwarancjaDo: day.nullable().optional(),
  uwagi: opt(5000), dlaKlienta: z.boolean(),
};
export const deviceCreateSchema = z.object({ opId, ...teczka, ...deviceFields });
export type DeviceCreate = z.infer<typeof deviceCreateSchema>;
export const deviceUpdateSchema = z.object(deviceFields).partial().extend({ opId });
export type DeviceUpdate = z.infer<typeof deviceUpdateSchema>;

const entryFields = {
  dzien: day,
  jobId: z.string().min(1).nullable().optional(),
  czynnosci: z.array(txt.min(1).max(200)).max(50).default([]),
  uwagi: opt(5000),
  dlaKlienta: z.boolean(),
  uploadIds: z.array(z.string().min(1)).max(30).default([]),
};
/** Wpis karty serwisowej; tworzy teczkę, gdy jej nie ma, i ustawia następny serwis (w jednej transakcji). */
export const serviceEntryCreateSchema = z.object({ opId, ...teczka, ...entryFields, nastepnySerwis: day.nullable().optional() })
  .refine((b) => b.czynnosci.length || b.uwagi || b.uploadIds.length, { message: 'Odhacz czynność, wpisz uwagi albo dodaj zdjęcie' });
export type ServiceEntryCreate = z.infer<typeof serviceEntryCreateSchema>;
// bez default (zod 4: .partial() z default nadpisałby zapisane pole)
export const serviceEntryUpdateSchema = z.object({ ...entryFields, czynnosci: entryFields.czynnosci.removeDefault(), uploadIds: entryFields.uploadIds.removeDefault() })
  .partial().extend({ opId });
export type ServiceEntryUpdate = z.infer<typeof serviceEntryUpdateSchema>;

/** Plik dodany w teczce (z POST /api/uploads); faktura – tylko admin. */
export const folderFileSchema = z.object({ opId, ...teczka, uploadId: z.string().min(1), typDok: z.enum(TYP_DOK), dlaKlienta: z.boolean() });
export type FolderFile = z.infer<typeof folderFileSchema>;
