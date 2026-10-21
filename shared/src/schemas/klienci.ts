import { z } from 'zod';

const opId = z.string().min(1).optional();
const txt = z.string().trim();
const list = z.array(txt.min(1)).default([]);

export const siteInputSchema = z.object({
  nazwa: txt.default(''),
  adres: txt.default(''),
  miejscowosc: txt.default(''),
  mapa: txt.default(''),
  opis: txt.default(''),
});
export type SiteInput = z.infer<typeof siteInputSchema>;

export const clientCreateSchema = z.object({
  opId,
  typ: z.enum(['osoba', 'firma']).default('osoba'),
  nazwa: txt.min(1, 'Podaj nazwę klienta'),
  telefony: list,
  emaile: list,
  nip: txt.default(''),
  notatki: txt.default(''),
  site: siteInputSchema.optional(),
});
export type ClientCreate = z.infer<typeof clientCreateSchema>;

export const clientUpdateSchema = z.object({
  opId,
  typ: z.enum(['osoba', 'firma']).optional(),
  nazwa: txt.min(1, 'Podaj nazwę klienta').optional(),
  telefony: z.array(txt.min(1)).optional(),
  emaile: z.array(txt.min(1)).optional(),
  nip: txt.optional(),
  notatki: txt.optional(),
});
export type ClientUpdate = z.infer<typeof clientUpdateSchema>;

export const siteCreateSchema = siteInputSchema.extend({ opId });
// Bez wartości domyślnych: pominięte pole nie może nadpisać zapisanego.
export const siteUpdateSchema = z.object({ nazwa: txt, adres: txt, miejscowosc: txt, mapa: txt, opis: txt }).partial().extend({ opId });
export type SiteUpdate = z.infer<typeof siteUpdateSchema>;
