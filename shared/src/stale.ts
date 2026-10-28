/** Stałe i funkcje bez zod, wspólne dla serwera i przeglądarki (schematy zod w schemas/ są dla serwera; ten plik nie ciągnie zod do pakietu aplikacji). */
import { addDays, addMonths } from './dates.js';

export const DICT_RODZAJE = [
  'status_zlecenia', 'status_leada', 'kategoria', 'ekipa', 'zrodlo', 'kod_nieobecnosci',
  'grupa_zadan', 'status_zadania', 'rodzaj_zlecenia', 'status_zakupu', 'dzien_wolny',
] as const;
export type DictRodzaj = (typeof DICT_RODZAJE)[number];

export const DICT_GRUPY = ['aktualne', 'pozniej', 'zamkniete'] as const;
export type DictGrupa = (typeof DICT_GRUPY)[number];

/** Cykl zadania cyklicznego: po „Zrobione” termin = dziś + cykl. */
export const CYKLE = { '1t': 'co tydzień', '2t': 'co 2 tygodnie', '1m': 'co miesiąc', '3m': 'co 3 miesiące', '6m': 'co pół roku', '1r': 'co rok' } as const;
export type Cykl = keyof typeof CYKLE;
export const nextTermin = (today: string, cykl: Cykl): string =>
  cykl === '1t' ? addDays(today, 7) : cykl === '2t' ? addDays(today, 14) : addMonths(today, { '1m': 1, '3m': 3, '6m': 6, '1r': 12 }[cykl]);

/** Miejsca w samochodzie (R42); Magazyn (carId = null) nie ma podmiejsc. */
export const PODMIEJSCA = ['Górna półka na regale', 'Środkowa półka na regale', 'Nad kabiną', 'Dolna półka', 'W kabinie'] as const;
export type Podmiejsce = (typeof PODMIEJSCA)[number];

/** Statusy zlecenia bez sensu dla zlecenia z leada (lead już wyceniony); słownik zostaje, znika tylko z wyboru. */
// shortcut: dopasowanie po nazwie wartości słownika; po zmianie nazwy statusu filtr przestaje działać – przejść na flagę w słowniku, gdy statusy będą zmieniane
const NOT_FROM_LEAD = ['nowe', 'do wyceny'];
export const jobStatusFromLead = (status: string): boolean => !NOT_FROM_LEAD.includes(status.trim().toLowerCase());

export const LOGIN_RE = /^[a-ząćęłńóśźż0-9._-]{2,32}$/;
export const LOGIN_MSG = 'Login: 2–32 znaków (litery, cyfry, . _ -)';
