import { describe, expect, it } from 'vitest';
import { ApiError } from '../../core/api.js';
import { cellKey, cellsOf, errText, komorek, monthDays, overwriteCount, rangeDays, sameCell, whereDay } from './model.js';

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

describe('overwriteCount', () => {
  const z = (jobId: string, polDnia = false) => ({ rodzaj: 'zlecenie' as const, jobId, polDnia });
  const cells = new Map([
    [cellKey('2026-10-26', 'a'), [z('J1')]],
    [cellKey('2026-10-26', 'b'), [z('J2', true), z('J3', true)]],
    [cellKey('2026-10-27', 'a'), [z('J9')]],
    [cellKey('2026-10-27', 'b'), [z('J9')]],
  ]);
  const drafts = new Map([[cellKey('2026-10-27', 'a'), { proposal: [] }], [cellKey('2026-10-27', 'b'), { proposal: [z('J5')] }]] as [string, any][]);
  const days = ['2026-10-26', '2026-10-27'];
  it('liczy niepuste inne wartości (szkic ma pierwszeństwo), bez komórki z edytora', () => {
    // 26|a J1, 26|b dwie połówki, 27|b szkic J5: inne; 27|a: szkic pusty (wyczyszczona), więc nie liczy się
    expect(overwriteCount(days, ['a', 'b'], [z('J9')], cells, drafts)).toBe(3);
    expect(overwriteCount(days, ['a', 'b'], [z('J9')], cells, drafts, cellKey('2026-10-26', 'a'))).toBe(2);
    expect(overwriteCount(days, ['b'], [z('J5')], cells, drafts)).toBe(1);
    expect(overwriteCount(days, ['a', 'b'], [], cells, drafts)).toBe(3); // czyszczenie też nadpisuje
  });
  it('komorek: polska odmiana', () => {
    expect([1, 2, 4, 5, 12, 22, 25].map(komorek)).toEqual(['1 komórkę', '2 komórki', '4 komórki', '5 komórek', '12 komórek', '22 komórki', '25 komórek']);
  });
});

it('whereDay: przed 16:00 od dziś, od 16:00 czasu polskiego od jutra (pusty weekend → poniedziałek)', () => {
  const days = ['2026-10-30', '2026-11-02', '2026-10-27'];
  expect(whereDay(days, new Date('2026-10-30T14:59:00Z'))).toBe('2026-10-30'); // pt 15:59 (CET)
  expect(whereDay(days, new Date('2026-10-30T15:00:00Z'))).toBe('2026-11-02'); // pt 16:00 → pon.
  expect(whereDay([...days, '2026-10-31'], new Date('2026-10-30T15:00:00Z'))).toBe('2026-10-31'); // sobota z wpisem zostaje
  expect(whereDay(days, new Date('2026-10-02T13:59:00Z'))).toBe('2026-10-27'); // 15:59 CEST, pierwszy dzień z wpisami
  expect(whereDay(['2026-10-02', '2026-10-05'], new Date('2026-10-02T14:00:00Z'))).toBe('2026-10-05'); // 16:00 CEST
  expect(whereDay(['2026-10-30'], new Date('2026-10-30T22:30:00Z'))).toBeUndefined(); // 23:30 – nic dalej
});
