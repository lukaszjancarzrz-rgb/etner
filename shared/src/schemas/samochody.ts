import { z } from 'zod';

const txt = z.string().trim();
const opId = z.string().min(1).optional();
const nazwa = txt.min(1, 'Wpisz nazwę samochodu').max(100, 'Nazwa jest za długa');
/** null = auto bez ekipy. */
const ekipa = txt.min(1).nullable();

export const carCreateSchema = z.object({ opId, nazwa, ekipa: ekipa.optional() });
export type CarCreate = z.infer<typeof carCreateSchema>;
// bez default (zod 4: .partial() z default nadpisałby zapisane pole)
export const carUpdateSchema = z.object({ opId, nazwa, ekipa }).partial();
export type CarUpdate = z.infer<typeof carUpdateSchema>;

export const faultCreateSchema = z.object({
  opId,
  carId: z.string().min(1, 'Wybierz samochód'),
  opis: txt.min(1, 'Opisz usterkę').max(500, 'Opis jest za długi'),
});
export type FaultCreate = z.infer<typeof faultCreateSchema>;
/** Dzień naprawy (admin); null = odwołana. */
const realDay = (d: string) => { const t = Date.parse(`${d}T12:00:00Z`); return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d; };
export const faultRepairSchema = z.object({
  opId,
  naprawaDzien: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data w formacie RRRR-MM-DD').refine(realDay, 'Nie ma takiego dnia').nullable(),
});
export type FaultRepair = z.infer<typeof faultRepairSchema>;
