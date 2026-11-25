import { z } from 'zod';
import { PODMIEJSCA } from '../stale.js';

const txt = z.string().trim();
const opId = z.string().min(1).optional();

const nazwa = txt.min(1, 'Wpisz nazwę narzędzia').max(200, 'Nazwa jest za długa');
const carId = z.string().min(1).nullable();
const podmiejsce = z.enum(PODMIEJSCA, 'Wybierz miejsce w samochodzie').nullable();
const sn = txt.max(100, 'Numer seryjny jest za długi');
const faktura = txt.max(200, 'Numer faktury jest za długi');
const dataZakupu = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data: RRRR-MM-DD').nullable();
/** Samochód wymaga podmiejsca, Magazyn go nie ma. */
export const toolPlaceOk = (t: { carId: string | null; podmiejsce: string | null }) => (t.carId ? !!t.podmiejsce : !t.podmiejsce);

export const toolCreateSchema = z.object({ opId, nazwa, carId, podmiejsce: podmiejsce.default(null), sn: sn.default(''), faktura: faktura.default(''), dataZakupu: dataZakupu.default(null) })
  .refine(toolPlaceOk, { message: 'Wybierz miejsce w samochodzie', path: ['podmiejsce'] });
export type ToolCreate = z.infer<typeof toolCreateSchema>;
// bez default (zod 4: .partial() z default nadpisałby zapisane pole); spójność miejsca sprawdza serwer po scaleniu
export const toolUpdateSchema = z.object({ opId, nazwa, carId, podmiejsce, sn, faktura, dataZakupu }).partial();
export type ToolUpdate = z.infer<typeof toolUpdateSchema>;

const czynnosc = txt.min(1, 'Wpisz czynność').max(500, 'Opis jest za długi');
const dzien = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data: RRRR-MM-DD');
export const toolServiceCreateSchema = z.object({ opId, dzien, czynnosc });
export type ToolServiceCreate = z.infer<typeof toolServiceCreateSchema>;
export const toolServiceUpdateSchema = z.object({ opId, dzien, czynnosc }).partial();
export type ToolServiceUpdate = z.infer<typeof toolServiceUpdateSchema>;
