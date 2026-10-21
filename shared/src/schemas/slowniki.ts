import { z } from 'zod';

export const DICT_RODZAJE = [
  'status_zlecenia', 'status_leada', 'kategoria', 'ekipa', 'zrodlo', 'kod_nieobecnosci',
  'grupa_zadan', 'status_zadania', 'rodzaj_zlecenia', 'status_zakupu', 'grupa_zakupow', 'dzien_wolny',
] as const;
export type DictRodzaj = (typeof DICT_RODZAJE)[number];

export const DICT_GRUPY = ['aktualne', 'pozniej', 'zamkniete'] as const;
export type DictGrupa = (typeof DICT_GRUPY)[number];

export const dictRodzajSchema = z.enum(DICT_RODZAJE);

/** PUT /api/dict/:rodzaj – pełna, uporządkowana lista wartości (kolejność = kolejność tablicy). */
export const dictPutSchema = z.object({
  opId: z.string().min(1).optional(),
  items: z.array(z.object({
    wartosc: z.string().trim().min(1, 'Wartość nie może być pusta'),
    grupa: z.enum(DICT_GRUPY).nullish(),
    platne: z.boolean().nullish(),
    kolor: z.string().trim().min(1).nullish(),
  })),
});
export type DictPut = z.infer<typeof dictPutSchema>;
