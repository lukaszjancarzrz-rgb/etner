import { describe, expect, it } from 'vitest';
import { czasomierzTekst, doSprawdzenia, filtruj, licznik, minuty, poprawione, roznica, sumyDni, sumyMiesiac, trwajacy, tydzienTekst, wgDni } from './model.js';

const e = (x: Record<string, unknown>) => ({ id: 'x', userId: 'u1', personId: 'p1', jobId: 'j1', dzien: '2026-11-13', od: '2026-11-13T06:25:00.000Z', do: '2026-11-13T15:00:00.000Z', odCz: '2026-11-13T06:25:00.000Z', doCz: '2026-11-13T15:00:00.000Z', zrodlo: 'czasomierz', autoStop: false, ...x });

describe('czas model', () => {
  it('poprawione, różnica, tekst z czasomierza', () => {
    const p = e({ od: '2026-11-13T06:00:00.000Z', do: '2026-11-13T15:00:00.000Z' });
    expect(poprawione(e({}))).toBe(false);
    expect(poprawione(p)).toBe(true);
    expect(roznica(p)).toBe(25);
    expect(czasomierzTekst(p)).toBe('czasomierz: 7:25 – 16:00 (8 h 35 min)');
    expect(poprawione(e({ zrodlo: 'reczny', odCz: null, doCz: null }))).toBe(false);
  });
  it('auto-stop do sprawdzenia znika po zatwierdzeniu', () => {
    expect(doSprawdzenia(e({ autoStop: true }))).toBe(true);
    expect(doSprawdzenia(e({ autoStop: true, edytowalAt: 'x' }))).toBe(false);
  });
  it('trwający wpis liczy do now', () => {
    const r = e({ do: null });
    expect(trwajacy([e({}), r], 'u1')).toBe(r);
    expect(trwajacy([r], 'u2')).toBeUndefined();
    expect(minuty(r, '2026-11-13T08:25:00.000Z')).toBe(120);
  });
  it('grupuje po dniach malejąco i sumuje', () => {
    const g = wgDni([e({ dzien: '2026-11-12', id: 'a' }), e({ id: 'b' }), e({ id: 'c', od: '2026-11-13T16:00:00.000Z', do: '2026-11-13T17:00:00.000Z' })], 'z');
    expect(g.map((d) => d.dzien)).toEqual(['2026-11-13', '2026-11-12']);
    expect(g[0]!.wpisy.map((x) => x.id)).toEqual(['c', 'b']);
    expect(g[0]!.minuty).toBe(60 + 515);
  });
  it('sumy tygodnia i miesiąca na osobę', () => {
    const es = [e({}), e({ dzien: '2026-11-10', od: '2026-11-10T07:00:00.000Z', do: '2026-11-10T08:00:00.000Z' }), e({ personId: 'p2', dzien: '2026-12-01' })];
    const dni = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
    expect(sumyDni(es, dni, 'z').get('p1')).toEqual({ dni: [0, 60, 0, 0, 515, 0, 0], razem: 575 });
    expect(sumyDni(es, dni, 'z').has('p2')).toBe(false);
    expect(sumyMiesiac(es, '2026-11', 'z').get('p1')).toEqual({ razem: 575, dni: 2 });
  });
  it('filtry i etykiety', () => {
    const es = [e({ id: 'a' }), e({ id: 'b', autoStop: true, jobId: null }), e({ id: 'c', zrodlo: 'reczny', personId: 'p2' })];
    expect(filtruj(es, { rodzaj: 'auto' }).map((x) => x.id)).toEqual(['b']);
    expect(filtruj(es, { rodzaj: 'reczne', personId: 'p2' }).map((x) => x.id)).toEqual(['c']);
    expect(filtruj(es, { rodzaj: 'wszystkie', jobId: 'none' }).map((x) => x.id)).toEqual(['b']);
    expect(tydzienTekst('2026-11-14')).toBe('09.11 – 15.11.2026');
    expect(licznik('2026-11-13T06:00:00.000Z', Date.parse('2026-11-13T08:14:36.000Z'))).toBe('2:14:36');
  });
});
