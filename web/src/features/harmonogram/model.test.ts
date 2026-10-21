import { expect, it } from 'vitest';
import { ApiError } from '../../core/api.js';
import { cellsOf, errText, monthDays, rangeDays, sameCell } from './model.js';

it('cellsOf: sloty po kolei w komórce dzień|osoba, sameCell bez względu na kolejność kluczy', () => {
  const m = cellsOf([
    { id: 'b', dzien: '2026-10-26', personId: 'p1', rodzaj: 'kod', kod: 'urlop', polDnia: true, slot: 1 },
    { id: 'a', dzien: '2026-10-26', personId: 'p1', rodzaj: 'zlecenie', jobId: 'j1', polDnia: true, slot: 0 },
    { id: 'c', dzien: '2026-10-27', personId: 'p1', rodzaj: 'tekst', tekst: 'Biuro', polDnia: false, slot: 0 },
  ]);
  expect(m.get('2026-10-26|p1')).toEqual([{ rodzaj: 'zlecenie', jobId: 'j1', polDnia: true }, { rodzaj: 'kod', kod: 'urlop', polDnia: true }]);
  expect(sameCell(m.get('2026-10-27|p1')!, [{ polDnia: false, tekst: 'Biuro', rodzaj: 'tekst' }])).toBe(true);
  expect(sameCell(m.get('2026-10-27|p1')!, [])).toBe(false);
});

it('errText: sesja, serwer, brak sieci, komunikat serwera', () => {
  expect(errText(new ApiError(401, 'x'))).toMatch(/Sesja wygasła/);
  expect(errText(new ApiError(503, 'x'))).toMatch(/Błąd serwera/);
  expect(errText(new TypeError('Failed to fetch'))).toMatch(/Brak połączenia/);
  expect(errText(new ApiError(400, 'Nie znaleziono osoby w harmonogramie'))).toBe('Nie znaleziono osoby w harmonogramie');
});

it('rangeDays: od–do, tylko dni robocze bez weekendu, święta i dnia wolnego; zmiana czasu nie gubi dnia', () => {
  // 2026-10-25 = zmiana czasu (niedziela); 2026-11-01 i 11-11 święta
  expect(rangeDays('2026-10-23', '2026-10-27', false, [])).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
  expect(rangeDays('2026-10-23', '2026-10-27', true, [])).toEqual(['2026-10-23', '2026-10-26', '2026-10-27']);
  expect(rangeDays('2026-11-09', '2026-11-13', true, ['2026-11-10'])).toEqual(['2026-11-09', '2026-11-12', '2026-11-13']);
  expect(rangeDays('2026-10-27', '2026-10-26', true, [])).toEqual([]);
});

it('monthDays: pełny miesiąc, także z przestawieniem zegara i w lutym', () => {
  const oct = monthDays('2026-10-21');
  expect(oct).toHaveLength(31);
  expect([oct[0], oct.at(-1)]).toEqual(['2026-10-01', '2026-10-31']);
  expect(new Set(oct).size).toBe(31);
  expect(monthDays('2026-03-29')).toHaveLength(31);
  expect(monthDays('2028-02-10').at(-1)).toBe('2028-02-29');
});
