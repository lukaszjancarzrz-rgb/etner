import { z } from 'zod';

/**
 * Dane arkusza Firma_2026 (karty modułu 1) po odczycie, przed przekształceniem. Teksty przycięte, puste = '';
 * daty jako RRRR-MM-DD albo null. `wiersz` = numer wiersza w arkuszu (do listy „do przejrzenia”), `sekcja` = nazwa ze znacznika w kolumnie A.
 */
const txt = z.string();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const at = { wiersz: z.number().int().positive(), sekcja: txt };

export const oldJobSchema = z.object({
  ...at, kat: txt, status: txt, termin: txt, ekipa: txt, lokalizacja: txt, klient: txt, zakres: txt, kontakt: txt, uwagi: txt, haslo: txt, zamknieto: day,
});
export const oldLeadSchema = z.object({
  ...at, dodano: day, kat: txt, status: txt, temat: txt, klient: txt, kontakt: txt, zrodlo: txt, opis: txt, wartosc: z.number().nullable(),
  nastepny: day, ustalono: txt, ostatni: day, uwagi: txt, zamknieto: day,
});
export const oldContactSchema = z.object({
  wiersz: z.number().int().positive(), dzien: day, temat: txt, klient: txt, kontakt: txt, plan: day, ustalono: txt, nastepny: day, status: txt, zapisano: txt,
});
/** Kolumna osoby w harmonogramie; `placowa` = z listy płac (kolumny przed „Uwagi”), inaczej osoba spoza płac. */
export const oldPersonSchema = z.object({ kol: txt.min(1), nazwa: txt.min(1), placowa: z.boolean() });
/** Dzień harmonogramu: niepuste komórki osób (klucz = litera kolumny) i uwaga dnia. */
export const oldDaySchema = z.object({ wiersz: z.number().int().positive(), dzien: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), komorki: z.record(txt, txt), uwagi: txt });
export const oldTaskSchema = z.object({
  ...at, tekst: txt, priorytet: z.number().nullable(), grupa: txt, status: txt, termin: day, uwagi: txt, zrobiono: day,
});
export const oldBuySchema = z.object({
  ...at, co: txt, sklep: txt, grupa: txt, status: txt, kwota: z.number().nullable(), lista: txt, uwagi: txt, kupiono: day,
});

export const oldDataSchema = z.object({
  zlecenia: z.array(oldJobSchema),
  wyceny: z.array(oldLeadSchema),
  historia: z.array(oldContactSchema),
  harmonogram: z.object({ persons: z.array(oldPersonSchema), days: z.array(oldDaySchema) }),
  zadania: z.array(oldTaskSchema),
  zakupy: z.array(oldBuySchema),
  parametry: z.object({
    kategorie: z.array(z.object({ kod: txt.min(1), nazwa: txt })),
    /** Kody harmonogramu z listy wyboru (urlop, na żądanie, …). */
    kody: z.array(txt.min(1)),
  }),
});

export type OldData = z.infer<typeof oldDataSchema>;
export type OldJob = z.infer<typeof oldJobSchema>;
export type OldLead = z.infer<typeof oldLeadSchema>;
export type OldContact = z.infer<typeof oldContactSchema>;
export type OldTask = z.infer<typeof oldTaskSchema>;
export type OldBuy = z.infer<typeof oldBuySchema>;
