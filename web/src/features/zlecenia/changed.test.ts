import { describe, expect, it } from 'vitest';
import { changedFields } from './changed.js';

const T0 = '2026-10-21T08:00:00.000Z', T1 = '2026-10-21T09:00:00.000Z', T2 = '2026-10-21T10:00:00.000Z', T3 = '2026-10-21T11:00:00.000Z';
const v = (o: Record<string, unknown>) => ({ id: 'j', status: 'Przyjęta', termin: '2026-11', telefony: ['1'], ...o }) as any;
const F = ['status', 'termin', 'telefony'];

describe('changedFields (R62)', () => {
  it('pola zmienione przez inną osobę po wizycie; widziana wersja = ostatnia sprzed wizyty', () => {
    const hist = [v({ updatedAt: T0, _by: 'a' }), v({ updatedAt: T1, _by: 'a', termin: '2026-12' })];
    const r = v({ updatedAt: T2, _by: 'a', termin: '2026-12', status: 'W realizacji', telefony: ['1', '2'], _hist: hist });
    expect([...changedFields(r, T1, 'me', F)].sort()).toEqual(['status', 'telefony']);
    expect([...changedFields(r, T0, 'me', F)].sort()).toEqual(['status', 'telefony', 'termin']);
    expect(changedFields(r, T2, 'me', F).size).toBe(0);
  });

  it('bez historii (snapshot), własna zmiana, zmiana bez _by i powrót do widzianej wartości: nie nowe', () => {
    expect(changedFields(v({ updatedAt: T2, _by: 'a', status: 'X' }), T1, 'me', F).size).toBe(0);
    const base = v({ updatedAt: T0, _by: 'a' });
    expect(changedFields(v({ updatedAt: T2, _by: 'me', status: 'X', _hist: [base] }), T1, 'me', F).size).toBe(0);
    expect(changedFields(v({ updatedAt: T2, status: 'X', _hist: [v({ updatedAt: T0 })] }), T1, 'me', F).size).toBe(0);
    const back = v({ updatedAt: T3, _by: 'a', _hist: [base, v({ updatedAt: T2, _by: 'a', status: 'X' })] });
    expect(changedFields(back, T1, 'me', F).size).toBe(0);
    // cudza zmiana, potem ja poprawiłem to samo pole
    const fixed = v({ updatedAt: T3, _by: 'me', status: 'Y', _hist: [base, v({ updatedAt: T2, _by: 'a', status: 'X' })] });
    expect(changedFields(fixed, T1, 'me', F).size).toBe(0);
  });

  it('kopia optymistyczna (updatedAt poprzedniej wersji, stary _by) nie przypisuje mojej zmiany innej osobie', () => {
    const v1 = v({ updatedAt: T2, _by: 'a', status: 'X' });
    const opt = { ...v1, termin: '2027-01' };
    const echo = v({ updatedAt: T3, _by: 'me', status: 'X', termin: '2027-01', _hist: [v({ updatedAt: T0, _by: 'a' }), v1, opt] });
    expect([...changedFields(echo, T1, 'me', F)]).toEqual(['status']);
    // przed echem: obecny rekord to sama kopia optymistyczna
    expect([...changedFields({ ...opt, _hist: [v({ updatedAt: T0, _by: 'a' }), v1] }, T1, 'me', F)]).toEqual(['status']);
  });

  it('wszystkie zapamiętane wersje nowsze od wizyty: porównanie od najstarszej', () => {
    const r = v({ updatedAt: T3, _by: 'a', status: 'Z', _hist: [v({ updatedAt: T2, _by: 'a' })] });
    expect([...changedFields(r, T1, 'me', F)]).toEqual(['status']);
  });
});
