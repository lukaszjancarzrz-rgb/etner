import { describe, expect, it } from 'vitest';
import { byTermin } from './jobs.js';

describe('byTermin', () => {
  it('najstarszy miesiąc na górze, bez terminu na końcu; w miesiącu najwcześniejszy pierwszy dzień w harmonogramie, bez dni dalej', () => {
    const jobs = [
      { id: 'a', termin: '2026-11', numer: 'Z1' }, { id: 'b', termin: '2026-12', numer: 'Z2' }, { id: 'c', termin: null, numer: 'Z3' },
      { id: 'd', termin: '2026-11', numer: 'Z4' }, { id: 'e', termin: '2026-11', numer: 'Z5' },
    ];
    const first = new Map([['a', '2026-11-10'], ['d', '2026-11-03']]);
    expect([...jobs].sort(byTermin(first)).map((j) => j.id)).toEqual(['d', 'a', 'e', 'b', 'c']);
  });
});
