import { z } from 'zod';
import { TYP_DOK } from '../stale.js';

const txt = z.string().trim();
const opId = z.string().min(1).optional();
const realDay = (d: string) => { const t = Date.parse(`${d}T12:00:00Z`); return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d; };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data w formacie RRRR-MM-DD').refine(realDay, 'Nie ma takiego dnia');
const teczka = { siteId: z.string().min(1, 'Wybierz obiekt'), kategoria: txt.min(1, 'Wybierz kategorię') };
/** Teczka zapisu: `folderId` (znana teczka – zapis z kolejki przetrwa zmianę nazwy kategorii) albo (obiekt, kategoria) – teczka powstaje, gdy jej nie ma. */
const doTeczki = { folderId: z.string().min(1).optional(), siteId: teczka.siteId.optional(), kategoria: teczka.kategoria.optional() };
const maTeczke = [(b: { folderId?: string; siteId?: string; kategoria?: string }) => !!b.folderId || !!(b.siteId && b.kategoria), { message: 'Wybierz obiekt i kategorię' }] as const;
const opt = (max: number) => txt.max(max, 'Tekst jest za długi').optional();

/** Ręczne „Dodaj teczkę” (admin). */
export const folderCreateSchema = z.object({ opId, ...teczka });
export type FolderCreate = z.infer<typeof folderCreateSchema>;
/** R71: bez notatki z rozliczeniem (stare zapisy z kolejki z tym polem – pole pomijane). */
export const folderUpdateSchema = z.object({
  opId,
  nastepnySerwis: day.nullable().optional(),
  cyklMies: z.number().int().min(1).max(120).nullable().optional(),
  przypomnienia: z.boolean().optional(),
});
export type FolderUpdate = z.infer<typeof folderUpdateSchema>;

const deviceFields = {
  nazwa: txt.min(1, 'Wpisz nazwę urządzenia').max(200, 'Nazwa jest za długa'),
  producent: opt(200), model: opt(200), nrSeryjny: opt(200),
  montaz: day.nullable().optional(), jobId: z.string().min(1).nullable().optional(), gwarancjaDo: day.nullable().optional(),
  uwagi: opt(5000), dlaKlienta: z.boolean(),
};
export const deviceCreateSchema = z.object({ opId, ...doTeczki, ...deviceFields }).refine(...maTeczke);
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
export const serviceEntryCreateSchema = z.object({ opId, ...doTeczki, ...entryFields, nastepnySerwis: day.nullable().optional() })
  .refine(...maTeczke).refine((b) => b.czynnosci.length || b.uwagi || b.uploadIds.length, { message: 'Odhacz czynność, wpisz uwagi albo dodaj zdjęcie' });
export type ServiceEntryCreate = z.infer<typeof serviceEntryCreateSchema>;
// bez default (zod 4: .partial() z default nadpisałby zapisane pole)
export const serviceEntryUpdateSchema = z.object({ ...entryFields, czynnosci: entryFields.czynnosci.removeDefault(), uploadIds: entryFields.uploadIds.removeDefault() })
  .partial().extend({ opId });
export type ServiceEntryUpdate = z.infer<typeof serviceEntryUpdateSchema>;

/** Plik lub zdjęcie (bez typu) dodane w teczce (z POST /api/uploads); faktura – tylko admin. Bez `dlaKlienta` = w paszporcie dla klienta (faktura zawsze wewnętrzna). */
export const folderFileSchema = z.object({ opId, ...doTeczki, uploadId: z.string().min(1), typDok: z.enum(TYP_DOK).optional(), dlaKlienta: z.boolean().optional() }).refine(...maTeczke);
export type FolderFile = z.infer<typeof folderFileSchema>;

/** PATCH /api/attachments/:id: „dla klienta” (admin; `dla_klienta` – starsze wersje aplikacji) i typ dokumentu (admin albo autor; faktura tylko admin). */
export const attachmentPatchSchema = z.object({
  opId,
  dlaKlienta: z.boolean().optional(),
  dla_klienta: z.boolean().optional(),
  typDok: z.enum(TYP_DOK).nullable().optional(),
});
export type AttachmentPatch = z.infer<typeof attachmentPatchSchema>;

/** „Załóż paszport” (pracownik i admin); drugi raz na ten sam obiekt zwraca istniejący. */
export const passportCreateSchema = z.object({ opId, siteId: teczka.siteId });
export type PassportCreate = z.infer<typeof passportCreateSchema>;

/** Dane firmy na naklejce i stronie klienta (P9, admin). */
export const firmaSchema = z.object({
  nazwa: txt.min(1, 'Wpisz nazwę firmy').max(200, 'Nazwa jest za długa'),
  telefon: txt.max(50, 'Telefon jest za długi'),
  email: txt.max(200, 'Adres jest za długi').refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Wpisz poprawny adres e-mail'),
  www: txt.max(200, 'Adres jest za długi'),
});
export type Firma = z.infer<typeof firmaSchema>;
