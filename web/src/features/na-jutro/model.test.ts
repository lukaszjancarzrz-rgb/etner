import { describe, expect, it } from 'vitest';
import { crewRepairs, dayJobIds, fits, rankTemplates } from './model.js';

const t = (id: string, kategorie: string[], rodzaje: string[] = [], kolejnosc = 0) => ({ id, nazwa: id, kategorie, rodzaje, kolejnosc, pozycje: [] });
const job = (id: string, kategoria: string, rodzaj = 'montaż', ekipa = 'A') => ({ id, kategoria, rodzaj, ekipa });

describe('listy predefiniowane: dopasowanie', () => {
  it('kategoria i (jeśli podano) rodzaj', () => {
    expect(fits(t('a', ['Elektryka', 'Fotowoltaika']), job('j', 'Fotowoltaika'))).toBe(true);
    expect(fits(t('a', ['Rekuperacja']), job('j', 'Fotowoltaika'))).toBe(false);
    expect(fits(t('a', ['Rekuperacja'], ['przygotówka']), job('j', 'Rekuperacja', 'montaż'))).toBe(false);
    expect(fits(t('a', ['Rekuperacja'], ['przygotówka']), job('j', 'Rekuperacja', 'przygotówka'))).toBe(true);
    expect(fits(t('a', [], ['serwis']), job('j', 'Klimatyzacja', 'serwis'))).toBe(true);
    expect(fits(t('a', []), job('j', 'Klimatyzacja'))).toBe(false);
  });

  it('pasujące na górze z ich zleceniami, potem reszta wg kolejności', () => {
    const ts = [t('Elektryka', ['Elektryka'], [], 0), t('Reku', ['Rekuperacja'], [], 1), t('Klima', ['Klimatyzacja'], [], 2), t('Alarm', ['Elektryka'], [], 3)];
    const r = rankTemplates(ts, [job('j1', 'Klimatyzacja'), job('j2', 'Elektryka')]);
    expect(r.map((x) => x.t.id)).toEqual(['Elektryka', 'Klima', 'Alarm', 'Reku']);
    expect(r[1]!.jobs.map((j) => j.id)).toEqual(['j1']);
    expect(r[3]!.jobs).toEqual([]);
  });

  it('zlecenia dnia (R45): pracownik tylko swój wiersz, admin członkowie wybranej ekipy; ekipa zlecenia bez znaczenia', () => {
    const jobs = new Map([job('j1', 'Elektryka', 'montaż', 'A'), job('j2', 'Klimatyzacja', 'montaż', 'B'), job('j3', 'Rekuperacja', 'montaż', 'B'), job('j4', 'Inne', 'montaż', 'B')].map((j) => [j.id, j]));
    const people = [{ id: 'p1', userId: 'me' }, { id: 'p2', userId: 'kolega' }, { id: 'p3', userId: 'obcy' }, { id: 'p4', userId: null }];
    const e = (personId: string, jobId: string | null, dzien = '2026-10-23', rodzaj = 'zlecenie') => ({ id: `${personId}${jobId}${dzien}`, personId, jobId, dzien, rodzaj });
    // j1 to zlecenie ekipy A, ale jedzie na nie ktoś z B – nie podświetla się dla A
    const entries = [e('p3', 'j1'), e('p1', 'j2'), e('p2', 'j3'), e('p3', 'j4'), e('p4', 'j4'), e('p1', 'j1', '2026-10-24'), e('p1', null, '2026-10-23', 'kod')];
    const ek: Record<string, string> = { me: 'A', kolega: 'A', obcy: 'B' };
    expect(dayJobIds(entries, people, '2026-10-23', jobs, (u) => u === 'me')).toEqual(['j2']); // pracownik: tylko swoje
    expect(dayJobIds(entries, people, '2026-10-23', jobs, (u) => ek[u] === 'A').sort()).toEqual(['j2', 'j3']); // admin, ekipa A
    expect(dayJobIds(entries, people, '2026-10-23', jobs, (u) => ek[u] === 'B').sort()).toEqual(['j1', 'j4']); // admin, ekipa B
  });
});

describe('crewRepairs', () => {
  it('tylko auta tej ekipy z naprawą tego dnia; bez usuniętych', () => {
    const cars = [{ id: 'c1', nazwa: 'Mała Toyota', ekipa: 'A' }, { id: 'c2', nazwa: 'Stary Ducato', ekipa: 'B' }, { id: 'c3', nazwa: 'Stara', ekipa: 'A', deletedAt: 'x' }];
    const faults = [
      { id: 'f1', carId: 'c1', opis: 'check engine', naprawaDzien: '2026-11-03' },
      { id: 'f2', carId: 'c1', opis: 'inny dzień', naprawaDzien: '2026-11-04' },
      { id: 'f3', carId: 'c2', opis: 'druga ekipa', naprawaDzien: '2026-11-03' },
      { id: 'f4', carId: 'c1', opis: 'usunięta', naprawaDzien: '2026-11-03', deletedAt: 'x' },
      { id: 'f5', carId: 'c3', opis: 'auto usunięte', naprawaDzien: '2026-11-03' },
    ];
    expect(crewRepairs(cars, faults, 'A', '2026-11-03')).toEqual([{ id: 'f1', auto: 'Mała Toyota', opis: 'check engine' }]);
    expect(crewRepairs(cars, faults, 'B', '2026-11-04')).toEqual([]);
  });
});
