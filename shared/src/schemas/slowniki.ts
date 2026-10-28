import { z } from 'zod';
import { DICT_GRUPY, DICT_RODZAJE } from '../stale.js';

export const dictRodzajSchema = z.enum(DICT_RODZAJE);

/** PUT /api/dict/:rodzaj – pełna, uporządkowana lista wartości (kolejność = kolejność tablicy). */
export const dictPutSchema = z.object({
  opId: z.string().min(1).optional(),
  items: z.array(z.object({
    /** Istniejący wiersz (zmiana nazwy po id); nowy bez id. */
    id: z.string().min(1).optional(),
    wartosc: z.string().trim().min(1, 'Wartość nie może być pusta'),
    grupa: z.enum(DICT_GRUPY).nullish(),
    platne: z.boolean().nullish(),
    kolor: z.string().trim().min(1).nullish(),
  })),
});
export type DictPut = z.infer<typeof dictPutSchema>;
