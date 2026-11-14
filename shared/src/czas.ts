import { addDays, dayOf, mondayOf } from './dates.js';

/** Czasomierz: czasy jako ISO (UTC), dni i godziny w Europe/Warsaw. */
export const PRZYPOMNIENIE_MIN = 30;
export const MAX_WPIS_H = 16;
export const ZRODLA_CZASU = ['czasomierz', 'reczny'] as const;

const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** „7:05” – godzina w Warszawie. */
export const godzinaPl = (iso: string): string => hm.format(new Date(iso)).replace(/^0(\d)/, '$1');

/** Chwila (ISO) o godzinie HH:MM w Warszawie danego dnia. */
export function chwilaPl(dzien: string, godz: string): string {
  const guess = Date.parse(`${dzien}T${godz.padStart(5, '0')}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const offset = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - guess;
  return new Date(guess - offset).toISOString();
}

export const minutyMiedzy = (od: string, doo: string): number => Math.round((Date.parse(doo) - Date.parse(od)) / 60_000);

/** „8 h 05 min”, „45 min”. */
export const fmtMinuty = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

/** Auto-stop (C3): 20:00 dnia startu albo 11 h od startu – co pierwsze (start po 20:00: tylko 11 h). */
export function limitStopu(od: string): string {
  const t11 = Date.parse(od) + 11 * 3_600_000;
  const t20 = Date.parse(chwilaPl(dayOf(od), '20:00'));
  return new Date(Date.parse(od) < t20 ? Math.min(t20, t11) : t11).toISOString();
}

/** Pracownik poprawia wpisy z bieżącego i poprzedniego tygodnia (C4); pierwszy dzień okna. */
export const oknoEdycjiOd = (dzis: string): string => addDays(mondayOf(dzis), -7);
export const wOknieEdycji = (dzien: string, dzis: string): boolean => dzien >= oknoEdycjiOd(dzis) && dzien <= dzis;
