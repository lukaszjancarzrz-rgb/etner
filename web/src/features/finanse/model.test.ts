import { describe, expect, it } from 'vitest';
import { rozliczoneBezPrzychodu, sumaMiesiaca } from './model.js';

describe('rozliczoneBezPrzychodu', () => {
  it('zwraca „Rozliczone” bez przychodu, pomija z przychodem, „Zakończone” i usunięte przychody nie liczą się', () => {
    const jobs = [
      { id: 'a', status: 'Rozliczone' }, { id: 'b', status: ' rozliczone ' }, { id: 'c', status: 'Rozliczone' },
      { id: 'd', status: 'Zakończone' }, { id: 'e', status: 'Rozliczone', deletedAt: 'x' },
    ];
    const revs = [{ id: 'r1', jobId: 'b' }, { id: 'r2', jobId: 'c', deletedAt: 'x' }];
    expect(rozliczoneBezPrzychodu(jobs, revs).map((j) => j.id)).toEqual(['a', 'c']);
  });
});

describe('sumaMiesiaca', () => {
  it('liczy tylko dany miesiąc i pomija usunięte; sam rok sumuje cały rok', () => {
    const rows = [
      { id: '1', miesiac: '2026-10', nettoGr: 100 }, { id: '2', miesiac: '2026-10', nettoGr: 250 },
      { id: '3', miesiac: '2026-11', nettoGr: 999 }, { id: '4', miesiac: '2026-10', nettoGr: 5, deletedAt: 'x' },
    ];
    expect(sumaMiesiaca(rows, '2026-10')).toBe(350);
    expect(sumaMiesiaca(rows, '2026')).toBe(1349);
  });
});
