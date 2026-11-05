import { describe, expect, it } from 'vitest';
import { sortRows } from './table.js';

describe('sortRows', () => {
  const rows = [{ n: 'Z0010', t: 'Łasak' }, { n: 'Z0009', t: 'Zawoja' }, { n: '', t: 'adam' }, { n: 'Z0002', t: 'Łasak' }];
  it('numery po kolei, puste na końcu w obu kierunkach', () => {
    expect(sortRows(rows, (r) => r.n, 'asc').map((r) => r.n)).toEqual(['Z0002', 'Z0009', 'Z0010', '']);
    expect(sortRows(rows, (r) => r.n, 'desc').map((r) => r.n)).toEqual(['Z0010', 'Z0009', 'Z0002', '']);
  });
  it('polski alfabet, bez wielkości liter, stabilnie przy równych', () => {
    expect(sortRows(rows, (r) => r.t, 'asc').map((r) => r.n)).toEqual(['', 'Z0010', 'Z0002', 'Z0009']);
    expect(sortRows(rows, (r) => r.t, 'desc').map((r) => r.n)).toEqual(['Z0009', 'Z0010', 'Z0002', '']);
  });
  it('liczby jak liczby, nie zmienia wejścia', () => {
    const xs = [10, 9, null, 100];
    expect(sortRows(xs, (x) => x, 'asc')).toEqual([9, 10, 100, null]);
    expect(xs).toEqual([10, 9, null, 100]);
  });
});
