import { describe, expect, it } from 'vitest';
import { dayJobIds, fits, rankTemplates } from './model.js';

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

  it('zlecenia dnia: zlecenie ekipy, mój wiersz albo członek ekipy; inne dni i kody pomijane', () => {
    const jobs = new Map([job('j1', 'Elektryka', 'montaż', 'A'), job('j2', 'Klimatyzacja', 'montaż', 'B'), job('j3', 'Rekuperacja', 'montaż', 'B'), job('j4', 'Inne', 'montaż', 'B')].map((j) => [j.id, j]));
    const people = [{ id: 'p1', userId: 'me' }, { id: 'p2', userId: 'kolega' }, { id: 'p3', userId: 'obcy' }];
    const e = (personId: string, jobId: string | null, dzien = '2026-10-23', rodzaj = 'zlecenie') => ({ id: `${personId}${jobId}${dzien}`, personId, jobId, dzien, rodzaj });
    const entries = [e('p3', 'j1'), e('p1', 'j2'), e('p2', 'j3'), e('p3', 'j4'), e('p3', 'j1', '2026-10-24'), e('p1', null, '2026-10-23', 'kod')];
    const ek = (u: string) => (u === 'kolega' ? 'A' : u === 'obcy' ? 'B' : undefined);
    expect(dayJobIds(entries, people, '2026-10-23', 'A', 'me', jobs, ek).sort()).toEqual(['j1', 'j2', 'j3']);
    expect(dayJobIds(entries, people, '2026-10-23', 'A', 'me', jobs, () => undefined).sort()).toEqual(['j1', 'j2']); // pracownik nie zna cudzych ekip
  });
});
