import { z } from 'zod';

const txt = z.string().trim();

export const shoppingCreateSchema = z.object({
  opId: z.string().min(1).optional(),
  co: txt.min(1, 'Wpisz, co kupić').max(300, 'Tekst jest za długi'),
  sklep: txt.default(''),
  grupa: txt.default(''),
  uwagi: txt.default(''),
});
export type ShoppingCreate = z.infer<typeof shoppingCreateSchema>;

// Pola bez default (zod 4: .partial() z default nadpisałby zapisane pole); status i kwota tylko admin (serwer).
export const shoppingUpdateSchema = z.object({
  opId: z.string().min(1).optional(),
  co: txt.min(1, 'Wpisz, co kupić').max(300, 'Tekst jest za długi'),
  sklep: txt,
  grupa: txt,
  uwagi: txt,
  status: txt.min(1),
  /** Kwota w groszach. */
  kwotaGr: z.number().int().min(0).nullable(),
}).partial();
export type ShoppingUpdate = z.infer<typeof shoppingUpdateSchema>;
