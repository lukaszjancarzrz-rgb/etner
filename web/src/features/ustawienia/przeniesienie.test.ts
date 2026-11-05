import { describe, expect, it } from 'vitest';
import { reviewList, reviewWhere } from './przeniesienie.js';

const r = (id: string, o: Record<string, unknown>) => ({ id, arkusz: 'Harmonogram', dzien: null, wiersz: null, osoba: '', przejrzane: false, ...o });

describe('do przejrzenia po przeniesieniu', () => {
  it('nieodhaczone pierwsze, po dniu; przejrzane ukryte, chyba że pokazujemy wszystkie', () => {
    const recs = [r('a', { dzien: '2026-10-08', przejrzane: true }), r('b', { dzien: '2026-10-09' }), r('c', { dzien: '2026-10-05' }), r('d', { arkusz: 'Zlecenia', wiersz: 12 })];
    expect(reviewList(recs, false)).toEqual({ open: 3, items: [recs[2], recs[1], recs[3]] });
    expect(reviewList(recs, true).items.map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']);
  });
  it('miejsce: karta, dzień albo wiersz, osoba', () => {
    expect(reviewWhere(r('a', { dzien: '2026-10-08', osoba: 'Bartek', wiersz: 285 }))).toBe('Harmonogram · 08.10.2026 · Bartek');
    expect(reviewWhere(r('b', { arkusz: 'Zlecenia', wiersz: 12 }))).toBe('Zlecenia · wiersz 12');
  });
});
