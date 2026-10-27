import { z } from 'zod';

const txt = z.string().trim();
const opId = z.string().min(1).optional();

/** Miejsca w samochodzie (R42); Magazyn (carId = null) nie ma podmiejsc. */
export const PODMIEJSCA = ['Górna półka na regale', 'Środkowa półka na regale', 'Nad kabiną', 'Dolna półka', 'W kabinie'] as const;
export type Podmiejsce = (typeof PODMIEJSCA)[number];

const nazwa = txt.min(1, 'Wpisz nazwę narzędzia').max(200, 'Nazwa jest za długa');
const carId = z.string().min(1).nullable();
const podmiejsce = z.enum(PODMIEJSCA, 'Wybierz miejsce w samochodzie').nullable();
/** Samochód wymaga podmiejsca, Magazyn go nie ma. */
export const toolPlaceOk = (t: { carId: string | null; podmiejsce: string | null }) => (t.carId ? !!t.podmiejsce : !t.podmiejsce);

export const toolCreateSchema = z.object({ opId, nazwa, carId, podmiejsce: podmiejsce.default(null) })
  .refine(toolPlaceOk, { message: 'Wybierz miejsce w samochodzie', path: ['podmiejsce'] });
export type ToolCreate = z.infer<typeof toolCreateSchema>;
// bez default (zod 4: .partial() z default nadpisałby zapisane pole); spójność miejsca sprawdza serwer po scaleniu
export const toolUpdateSchema = z.object({ opId, nazwa, carId, podmiejsce }).partial();
export type ToolUpdate = z.infer<typeof toolUpdateSchema>;
