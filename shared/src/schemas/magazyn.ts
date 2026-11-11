import { z } from 'zod';

const txt = z.string().trim();
const opId = z.string().min(1).optional();
/** Ilość jako dowolny tekst, np. „opakowanie”, „garść”. */
const ilosc = txt.max(100, 'Ilość jest za długa');

export const itemCreateSchema = z.object({ opId, nazwa: txt.min(1, 'Wpisz, co leży na magazynie').max(200, 'Nazwa jest za długa'), ilosc: ilosc.default('') });
export type ItemCreate = z.infer<typeof itemCreateSchema>;
export const itemTakeSchema = z.object({ opId });
export const itemReturnSchema = z.object({ opId, ilosc });
/** Po ilu dniach rzecz z „Zabrane” znika. */
export const ZABRANE_DNI = 7;
