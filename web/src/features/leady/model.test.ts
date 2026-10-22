import { describe, expect, it } from 'vitest';
import { QUICK_DATES, contactGroups, jobPrefill, leadSections, nextAfterContact, parseZl } from './model.js';

const G: Record<string, string> = { Nowy: 'aktualne', 'Na kiedyś': 'pozniej', Przyjęta: 'zamkniete' };
const group = (s: string) => G[s] ?? 'aktualne';
const L = (id: string, status: string, nastepny = '', extra = {}) => ({ id, numer: `L000${id}`, status, nastepny, ...extra });

describe('leadSections', () => {
  it('zaległe na górze (też z Na kiedyś), zamknięte nigdy zaległe, bez terminu na końcu', () => {
    const s = leadSections([
      L('1', 'Nowy', ''), L('2', 'Nowy', '2026-10-30'), L('3', 'Nowy', '2026-10-22'), L('4', 'Na kiedyś', '2026-10-01'),
      L('5', 'Przyjęta', '2026-10-01', { zamknieteAt: '2026-10-02' }), L('6', 'Nowy', '2026-10-25'), L('7', 'Przyjęta', '', { zamknieteAt: '2026-10-05' }),
    ], group, '2026-10-22');
    expect(s.zalegle.map((l) => l.id)).toEqual(['4', '3']);
    expect(s.aktualne.map((l) => l.id)).toEqual(['6', '2', '1']);
    expect(s.pozniej).toEqual([]);
    expect(s.zamkniete.map((l) => l.id)).toEqual(['7', '5']);
  });
});

describe('nextAfterContact', () => {
  it('jak serwer: nowy termin, minięty czyszczony, przyszły zostaje', () => {
    expect(nextAfterContact('2026-10-20', '2026-11-01', '2026-10-22')).toBe('2026-11-01');
    expect(nextAfterContact('2026-10-22', '', '2026-10-22')).toBe('');
    expect(nextAfterContact('2026-10-30', '', '2026-10-22')).toBe('2026-10-30');
    expect(nextAfterContact('', '', '2026-10-22')).toBe('');
  });
});

describe('jobPrefill', () => {
  const statusy = [{ id: 'a', wartosc: 'Nowe', grupa: 'aktualne' }, { id: 'b', wartosc: 'Na później', grupa: 'pozniej' }];
  it('klient, obiekt, kategoria, opis jako punkt zakresu, pierwszy status aktualne', () => {
    expect(jobPrefill({ id: 'x', clientId: 'c', siteId: 's', kategoria: 'Klimatyzacja', temat: 'Klima', opis: ' Dwie jednostki ' }, statusy))
      .toEqual({ clientId: 'c', siteId: 's', kategoria: 'Klimatyzacja', status: 'Nowe', scope: 'Dwie jednostki' });
  });
  it('bez opisu: temat; bez klienta: puste', () => {
    expect(jobPrefill({ id: 'x', clientId: null, siteId: null, kategoria: '', temat: 'Klima', opis: '' }, [...statusy].reverse()))
      .toEqual({ clientId: '', siteId: '', kategoria: '', status: 'Nowe', scope: 'Klima' });
  });
});

describe('parseZl', () => {
  it('odrzuca „12.500”, ujemne i powyżej 100 mln; przyjmuje przecinek i kropkę z groszami', () => {
    expect(parseZl('12.500')).toEqual({ error: 'Użyj przecinka dla groszy, np. 12 500 albo 12500,00' });
    expect(parseZl('1.250.000')).toEqual({ error: 'Nie używaj kropek w kwocie' });
    expect(parseZl('1.250,00')).toEqual({ error: 'Nie używaj kropek w kwocie' });
    expect(parseZl('12 500')).toEqual({ gr: 1250000 });
    expect(parseZl('12500,00')).toEqual({ gr: 1250000 });
    expect(parseZl('12.5')).toEqual({ gr: 1250 });
    expect(parseZl('-5')).toHaveProperty('error');
    expect(parseZl('abc')).toHaveProperty('error');
    expect(parseZl('100 000 000,00')).toEqual({ gr: 10000000000 });
    expect(parseZl('100 000 000,01')).toEqual({ error: 'Maksymalnie 100 000 000,00 zł' });
  });
});

describe('QUICK_DATES', () => {
  it('+3 dni, +1 tydz., +1 mies. (koniec miesiąca przycięty)', () => {
    expect(QUICK_DATES.map((q) => q.at('2026-10-22'))).toEqual(['2026-10-25', '2026-10-29', '2026-11-22']);
    expect(QUICK_DATES.map((q) => q.at('2027-01-31'))).toEqual(['2027-02-03', '2027-02-07', '2027-02-28']);
  });
});

describe('contactGroups', () => {
  it('kolejność słownika, nieznany status na końcu, od najnowszego', () => {
    const C = (id: string, status: string, dzien: string, createdAt = '') => ({ id, status, dzien, createdAt });
    const g = contactGroups([C('1', 'Nowy', '2026-10-01'), C('2', 'Oferta', '2026-10-05'), C('3', 'Nowy', '2026-10-03'), C('4', 'Stary', '2026-09-01'),
      C('5', 'Nowy', '2026-10-03', '2026-10-03T12:00')], ['Nowy', 'Oferta', 'Przyjęta']);
    expect(g.map((x) => [x.status, x.list.map((c) => c.id)])).toEqual([['Nowy', ['5', '3', '1']], ['Oferta', ['2']], ['Stary', ['4']]]);
  });
});
