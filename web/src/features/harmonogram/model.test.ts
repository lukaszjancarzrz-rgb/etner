import { expect, it } from 'vitest';
import { cellsOf, sameCell } from './model.js';

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
