import { addDays, mondayOf } from './dates.js';

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31);
  const da = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}

export function plHolidays(year: number): Record<string, string> {
  const e = easter(year);
  const y = String(year);
  return {
    [`${y}-01-01`]: 'Nowy Rok',
    [`${y}-01-06`]: 'Trzech Króli',
    [e]: 'Wielkanoc (niedziela)',
    [addDays(e, 1)]: 'Poniedziałek Wielkanocny',
    [`${y}-05-01`]: 'Święto Pracy',
    [`${y}-05-03`]: 'Święto Konstytucji 3 Maja',
    [addDays(e, 49)]: 'Zielone Świątki (niedziela)',
    [addDays(e, 60)]: 'Boże Ciało',
    [`${y}-08-15`]: 'Wniebowzięcie NMP',
    [`${y}-11-01`]: 'Wszystkich Świętych',
    [`${y}-11-11`]: 'Narodowe Święto Niepodległości',
    [`${y}-12-24`]: 'Wigilia (dzień wolny od 2025 r.)',
    [`${y}-12-25`]: 'Boże Narodzenie – 1. dzień',
    [`${y}-12-26`]: 'Boże Narodzenie – 2. dzień',
  };
}

/** 2 = święto (ustawowe lub dodatkowo wolne), 0 = weekend, 1 = dzień roboczy */
export function isWorkday(day: string, extraOff: string[]): 0 | 1 | 2 {
  if (extraOff.includes(day) || day in plHolidays(Number(day.slice(0, 4)))) return 2;
  return day >= addDays(mondayOf(day), 5) ? 0 : 1;
}
