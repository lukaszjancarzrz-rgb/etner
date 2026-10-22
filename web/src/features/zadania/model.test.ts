import { describe, expect, it } from 'vitest';
import { isLate, taskGroups } from './model.js';

const T = (id: string, extra: Record<string, unknown> = {}) => ({ id, tekst: id, grupa: 'Firma', status: 'Do zrobienia', priorytet: null, termin: null, cykliczne: false, createdAt: id, updatedAt: id, ...extra });

describe('taskGroups', () => {
  it('grupy w kolejności słownika, bez grupy na końcu, priorytet potem termin, zrobione osobno', () => {
    const { groups, done } = taskGroups([
      T('a', { priorytet: 2 }), T('b', { priorytet: 1, termin: '2026-11-01' }), T('c'), T('d', { priorytet: 1, termin: '2026-10-01' }),
      T('e', { grupa: 'Sprzęt' }), T('f', { grupa: '' }), T('g', { grupa: 'Stara' }), T('h', { status: 'Zrobione' }),
      T('i', { status: 'Zrobione', cykliczne: true }), T('j', { priorytet: 10 }),
    ], ['Sprzęt', 'Firma']);
    expect(groups.map((g) => [g.grupa, g.list.map((t) => t.id)])).toEqual([['Sprzęt', ['e']], ['Firma', ['d', 'b', 'a', 'j', 'c', 'i']], ['', ['f', 'g']]]);
    expect(done.map((t) => t.id)).toEqual(['h']);
  });
  it('isLate: termin przed dziś, zrobione nie', () => {
    expect(isLate(T('a', { termin: '2026-10-21' }), '2026-10-22')).toBe(true);
    expect(isLate(T('a', { termin: '2026-10-22' }), '2026-10-22')).toBe(false);
    expect(isLate(T('a', { termin: '2026-10-01', status: 'Zrobione' }), '2026-10-22')).toBe(false);
  });
});
