import { z } from 'zod';
import { SPOSOBY } from '../finanse.js';

const txt = z.string().trim();
const gr = z.number().int();
const dzien = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data: RRRR-MM-DD');
const miesiac = z.string().regex(/^\d{4}-\d{2}$/, 'Miesiąc: RRRR-MM');
const kolumna = z.union([z.literal(12), z.literal(13), z.literal(14), z.literal(15)]);

export const revenueCreateSchema = z.object({
  opId: z.string().min(1).optional(),
  jobId: z.string().nullable().optional(),
  kategoria: txt.nullable().optional(),
  klient: txt.max(200).default(''),
  miejscowosc: txt.max(200).default(''),
  opis: txt.max(500).default(''),
  sposob: z.enum(SPOSOBY),
  kwotaGr: gr.min(0, 'Kwota nie może być ujemna'),
  dzien: dzien.nullable().optional(),
  innyMiesiac: miesiac.nullable().optional(),
  nrFaktury: txt.max(100).default(''),
  materialyGr: gr.min(0).nullable().optional(),
  uwagi: txt.default(''),
});
export type RevenueCreate = z.infer<typeof revenueCreateSchema>;

// Pola bez default (zod 4: .partial() z default nadpisałby zapisane pole).
export const revenueUpdateSchema = z.object({
  opId: z.string().min(1).optional(),
  jobId: z.string().nullable(),
  kategoria: txt.nullable(),
  klient: txt.max(200),
  miejscowosc: txt.max(200),
  opis: txt.max(500),
  sposob: z.enum(SPOSOBY),
  kwotaGr: gr.min(0, 'Kwota nie może być ujemna'),
  dzien: dzien.nullable(),
  innyMiesiac: miesiac.nullable(),
  nrFaktury: txt.max(100),
  materialyGr: gr.min(0).nullable(),
  uwagi: txt,
}).partial();
export type RevenueUpdate = z.infer<typeof revenueUpdateSchema>;

const costFields = {
  dzien,
  miesiac,
  nrDokumentu: txt.max(100),
  kontrahent: txt.max(200),
  nip: txt.max(20),
  opis: txt.max(500),
  kategoria: txt.min(1, 'Wybierz kategorię'),
  nettoGr: gr,
  kolumnaKpir: kolumna,
  doWyniku: z.boolean(),
  uwagi: txt,
};
export const costCreateSchema = z.object({ opId: z.string().min(1).optional(), ...costFields });
export type CostCreate = z.infer<typeof costCreateSchema>;
export const costUpdateSchema = z.object({ opId: z.string().min(1).optional(), ...costFields }).partial();
export type CostUpdate = z.infer<typeof costUpdateSchema>;

/** Plik importu z KPiR (docs/instrukcje/import-kpir.md): kwoty jako liczby zł, serwer zamienia na grosze. */
export const kpirFileSchema = z.object({
  format: z.literal('etner-kpir-1'),
  miesiac,
  kpir: z.object({ przychod: z.number(), towary: z.number(), uboczne: z.number(), wynagrodzenia: z.number(), pozostale: z.number() }),
  koszty: z.array(z.object({
    data: dzien,
    nrDokumentu: txt,
    kontrahent: txt,
    nip: txt.default(''),
    opis: txt,
    kategoria: txt.min(1),
    netto: z.number(),
    kolumnaKpir: kolumna,
    doWyniku: z.boolean().default(true),
    uwagi: txt.default(''),
  })),
});
export type KpirFile = z.infer<typeof kpirFileSchema>;

export const kpirMonthSchema = z.object({
  opId: z.string().min(1).optional(),
  przychodGr: gr, towaryGr: gr, uboczneGr: gr, wynagrodzeniaGr: gr, pozostaleGr: gr,
});
export type KpirMonth = z.infer<typeof kpirMonthSchema>;
