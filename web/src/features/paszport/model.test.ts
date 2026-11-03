import { describe, expect, it } from 'vitest';
import type { Rec } from '../../core/store.js';
import { freshIn, isPhoto, plural, serwisStan, sortPaszporty, teczkiObiektu, type Dane } from './model.js';

const ORDER = ['Elektryka', 'Fotowoltaika', 'Rekuperacja', 'Klimatyzacja'];
const at = (n: number) => `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`;
const job = (id: string, siteId: string, kategoria: string): Rec => ({ id, siteId, kategoria });
const entry = (id: string, jobId: string): Rec => ({ id, ownerType: 'job', ownerId: jobId });
const att = (id: string, ownerType: string, ownerId: string, rodzaj = 'zdjecie', n = 1): Rec => ({ id, ownerType, ownerId, rodzaj, createdAt: at(n) });
const empty: Dane = { jobs: [], folders: [], diary: [], scope: [], attachments: [], devices: [], service: [] };

describe('teczkiObiektu', () => {
  // RF #5: montaż + 2 serwisy Rekuperacji + Elektryka → dwie teczki; drugi obiekt klienta osobno
  const d: Dane = {
    ...empty,
    jobs: [job('j1', 's1', 'Rekuperacja'), job('j2', 's1', 'Rekuperacja'), job('j3', 's1', 'Rekuperacja'), job('j4', 's1', 'Elektryka'), job('j5', 's2', 'Rekuperacja'), job('j6', 's1', '')],
    diary: [entry('e1', 'j1'), entry('e2', 'j2'), entry('e4', 'j4'), entry('e5', 'j5')],
    scope: [{ id: 'z1', jobId: 'j3' }],
    attachments: [att('a1', 'entry', 'e1', 'zdjecie', 1), att('a2', 'entry', 'e2', 'zdjecie', 2), att('a3', 'scope', 'z1', 'zdjecie', 3), att('a4', 'entry', 'e4'), att('a5', 'entry', 'e5'), att('p1', 'entry', 'e1', 'plik')],
  };

  it('grupuje zlecenia i zdjęcia obiektu w teczki kategorii, w kolejności słownika', () => {
    const t = teczkiObiektu('s1', d, ORDER);
    expect(t.map((x) => x.kategoria)).toEqual(['Elektryka', 'Rekuperacja']);
    const r = t[1]!;
    expect(r.jobIds).toEqual(['j1', 'j2', 'j3']);
    expect(r.photos.map((p) => [p.a.id, p.jobId])).toEqual([['a3', 'j3'], ['a2', 'j2'], ['a1', 'j1']]);
    expect(r.docs.map((p) => p.a.id)).toEqual(['p1']);
    expect(r.folder).toBeUndefined();
    expect(teczkiObiektu('s2', d, ORDER).map((x) => [x.kategoria, x.jobIds])).toEqual([['Rekuperacja', ['j5']]]);
  });

  it('zmiana kategorii zlecenia przenosi je ze zdjęciami do innej teczki (RF #1)', () => {
    const moved = { ...d, jobs: d.jobs.map((j) => (j.id === 'j2' ? { ...j, kategoria: 'Klimatyzacja' } : j)) };
    const t = teczkiObiektu('s1', moved, ORDER);
    expect(t.map((x) => x.kategoria)).toEqual(['Elektryka', 'Rekuperacja', 'Klimatyzacja']);
    expect(t[2]!.photos.map((p) => p.a.id)).toEqual(['a2']);
    expect(t[1]!.photos.map((p) => p.a.id)).not.toContain('a2');
  });

  it('teczka bez zleceń (wiersz), urządzenia, wpisy z kolejki i pliki teczki', () => {
    const t = teczkiObiektu('s1', {
      ...empty,
      folders: [{ id: 'f1', siteId: 's1', kategoria: 'Fotowoltaika', nastepnySerwis: '2027-01-10' }, { id: 'f2', siteId: 's2', kategoria: 'Fotowoltaika' }],
      devices: [{ id: 'd1', folderId: 'f1' }, { id: 'd2', folderId: 'f2' }],
      service: [
        { id: 'w1', folderId: 'f1', dzien: '2026-05-01', createdAt: at(1) },
        { id: 'tmp-w', folderId: 'tmp-f', siteId: 's1', kategoria: 'Fotowoltaika', dzien: '2026-10-20', createdAt: at(20), _tmp: true },
      ],
      attachments: [att('t1', 'teczka', 'f1', 'plik'), att('t2', 'teczka', 'f2', 'plik'), att('sv', 'service', 'tmp-w'), att('dv', 'device', 'd1', 'plik'),
        { ...att('tmp-t', 'teczka', 'tmp-f', 'plik'), siteId: 's1', kategoria: 'Fotowoltaika' }],
    }, ORDER);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kategoria: 'Fotowoltaika', nastepnySerwis: '2027-01-10', jobIds: [] });
    expect(t[0]!.devices.map((x) => x.id)).toEqual(['d1']);
    expect(t[0]!.entries.map((x) => x.id)).toEqual(['tmp-w', 'w1']); // najnowszy dzień pierwszy
    expect(t[0]!.docs.map((x) => x.a.id).sort()).toEqual(['dv', 't1', 'tmp-t']);
    expect(t[0]!.photos.map((x) => x.a.id)).toEqual(['sv']);
  });

  it('tymczasowa teczka (wpis offline) ustępuje prawdziwej', () => {
    const t = teczkiObiektu('s1', { ...empty, folders: [{ id: 'tmp-f', siteId: 's1', kategoria: 'Rekuperacja', _tmp: true, nastepnySerwis: '2027-04-01' }] }, ORDER);
    expect(t[0]).toMatchObject({ kategoria: 'Rekuperacja', nastepnySerwis: '2027-04-01' });
    const both = teczkiObiektu('s1', { ...empty, folders: [{ id: 'tmp-f', siteId: 's1', kategoria: 'Rekuperacja', _tmp: true }, { id: 'f', siteId: 's1', kategoria: 'Rekuperacja', nastepnySerwis: '2027-05-01' }] }, ORDER);
    expect(both[0]!.folder!.id).toBe('f');
  });
});

describe('serwisStan, plural', () => {
  it('zaległy, dziś, za N dni, data', () => {
    expect(serwisStan('2026-11-02', '2026-11-03')).toEqual({ label: 'serwis zaległy', tone: 'late' });
    expect(serwisStan('2026-11-03', '2026-11-03')?.label).toBe('serwis dziś');
    expect(serwisStan('2026-11-04', '2026-11-03')?.label).toBe('serwis za 1 dzień');
    expect(serwisStan('2026-11-17', '2026-11-03')).toEqual({ label: 'serwis za 14 dni', tone: 'soon' });
    expect(serwisStan('2027-05-03', '2026-11-03')).toEqual({ label: 'serwis 03.05.2027', tone: 'later' });
    expect(serwisStan(null, '2026-11-03')).toBeNull();
    // zmiana czasu w październiku nie przesuwa licznika
    expect(serwisStan('2026-10-26', '2026-10-24')?.label).toBe('serwis za 2 dni');
  });
  it('odmiana', () => {
    const z: [string, string, string] = ['zlecenie', 'zlecenia', 'zleceń'];
    expect([1, 2, 5, 12, 22, 25].map((n) => plural(n, z))).toEqual(['1 zlecenie', '2 zlecenia', '5 zleceń', '12 zleceń', '22 zlecenia', '25 zleceń']);
  });
});

describe('freshIn', () => {
  it('nowe od ostatniej wizyty: cudze wpisy, urządzenia i pliki teczki; bez swoich, tymczasowych i plików z dziennika', () => {
    const t = teczkiObiektu('s1', {
      ...empty,
      jobs: [job('j1', 's1', 'Rekuperacja')],
      diary: [entry('e1', 'j1')],
      folders: [{ id: 'f1', siteId: 's1', kategoria: 'Rekuperacja' }],
      service: [
        { id: 'w-old', folderId: 'f1', dzien: '2026-10-01', authorId: 'u2', createdAt: at(1) },
        { id: 'w-new', folderId: 'f1', dzien: '2026-10-10', authorId: 'u2', createdAt: at(10) },
        { id: 'w-mine', folderId: 'f1', dzien: '2026-10-11', authorId: 'u1', createdAt: at(11) },
        { id: 'w-tmp', folderId: 'f1', dzien: '2026-10-12', authorId: 'u2', createdAt: at(12), _tmp: true },
      ],
      devices: [{ id: 'd-new', folderId: 'f1', createdBy: 'u2', createdAt: at(9) }],
      attachments: [{ ...att('t-new', 'teczka', 'f1', 'plik', 8), authorId: 'u2' }, { ...att('dz', 'entry', 'e1', 'zdjecie', 9), authorId: 'u2' }, { ...att('sv', 'service', 'w-new', 'zdjecie', 10), authorId: 'u2' }],
    }, ORDER)[0];
    expect([...freshIn(t, at(5), 'u1')].sort()).toEqual(['d-new', 'sv', 't-new', 'w-new']);
    expect(freshIn(t, at(20), 'u1').size).toBe(0);
    expect(freshIn(t, undefined, 'u1').size).toBe(0);
  });
});

describe('isPhoto', () => {
  it('zdjęcia ściśle po rodzaju albo typie obrazu (zdjęcie z „+ Plik” też w Zdjęciach)', () => {
    expect(isPhoto({ id: 'a', rodzaj: 'zdjecie' })).toBe(true);
    expect(isPhoto({ id: 'b', rodzaj: 'plik', mime: 'image/png' })).toBe(true);
    expect(isPhoto({ id: 'c', rodzaj: 'plik', mime: 'application/pdf' })).toBe(false);
  });
});

describe('sortPaszporty', () => {
  it('zaległy i najbliższy serwis pierwsze, bez terminu na końcu; dalej klient alfabetycznie (polskie litery)', () => {
    const r = (klient: string, termin?: string) => ({ klient, site: { id: klient } as Rec, ...(termin && { termin }) });
    const out = sortPaszporty([r('Żak'), r('Bąk', '2027-05-01'), r('Adam'), r('Łoś', '2026-10-01'), r('Cebula', '2027-05-01')]);
    expect(out.map((x) => x.klient)).toEqual(['Łoś', 'Bąk', 'Cebula', 'Adam', 'Żak']);
  });
});
