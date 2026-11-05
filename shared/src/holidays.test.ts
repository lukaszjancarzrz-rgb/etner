import { describe, expect, it } from 'vitest';
import { isWorkday, plHolidays } from './holidays.js';

describe('holidays', () => {
  it('2026: 14 świąt', () => {
    expect(plHolidays(2026)).toEqual({
      '2026-01-01': 'Nowy Rok',
      '2026-01-06': 'Trzech Króli',
      '2026-04-05': 'Wielkanoc (niedziela)',
      '2026-04-06': 'Poniedziałek Wielkanocny',
      '2026-05-01': 'Święto Pracy',
      '2026-05-03': 'Święto Konstytucji 3 Maja',
      '2026-05-24': 'Zielone Świątki (niedziela)',
      '2026-06-04': 'Boże Ciało',
      '2026-08-15': 'Wniebowzięcie NMP',
      '2026-11-01': 'Wszystkich Świętych',
      '2026-11-11': 'Narodowe Święto Niepodległości',
      '2026-12-24': 'Wigilia (dzień wolny od 2025 r.)',
      '2026-12-25': 'Boże Narodzenie – 1. dzień',
      '2026-12-26': 'Boże Narodzenie – 2. dzień',
    });
  });
  it('2027 Wielkanoc', () => {
    expect(plHolidays(2027)['2027-03-28']).toBe('Wielkanoc (niedziela)');
  });
  it('isWorkday', () => {
    expect(isWorkday('2026-05-01', [])).toBe(2);
    expect(isWorkday('2026-10-24', [])).toBe(0);
    expect(isWorkday('2026-10-23', ['2026-10-23'])).toBe(2);
    expect(isWorkday('2026-10-23', [])).toBe(1);
    expect(isWorkday('2026-05-03', [])).toBe(2); // święto w niedzielę: święto wygrywa
  });
});
