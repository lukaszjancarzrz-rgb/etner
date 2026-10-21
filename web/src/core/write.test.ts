import { expect, it } from 'vitest';
import { withoutEchoes } from './write.js';

const T = '2026-10-21T12:00:00.000Z';
it('withoutEchoes: tymczasowy znika, gdy przyszedł prawdziwy o tych samych polach', () => {
  const tmp = { id: 'tmp-1', _tmp: true, co: 'Taśma', by: 'u1', createdAt: T };
  const other = { id: 'tmp-2', _tmp: true, co: 'Kolanka', by: 'u1', createdAt: T };
  const real = { id: 'R1', co: 'Taśma', by: 'u1', createdAt: '2026-10-21T12:00:01.000Z' };
  expect(withoutEchoes([tmp, other], ['co', 'by'])).toEqual([tmp, other]);
  expect(withoutEchoes([tmp, other, real], ['co', 'by'])).toEqual([other, real]);
});

it('withoutEchoes: starszy rekord o tej samej treści nie ukrywa nowego (np. „Taśma” już w Kupionych)', () => {
  const old = { id: 'R0', co: 'Taśma', by: 'u1', createdAt: '2026-10-01T08:00:00.000Z' };
  const tmp = { id: 'tmp-1', _tmp: true, co: 'Taśma', by: 'u1', createdAt: T };
  expect(withoutEchoes([old, tmp], ['co', 'by'])).toEqual([old, tmp]);
  // wpis tylko ze zdjęciem: ten sam autor i pusty tekst co poprzedni
  const e0 = { id: 'E0', authorId: 'u1', tekst: '', createdAt: '2026-10-21T11:58:00.000Z' };
  const e1 = { id: 'tmp-2', _tmp: true, authorId: 'u1', tekst: '', createdAt: T };
  expect(withoutEchoes([e0, e1], ['authorId', 'tekst'])).toEqual([e0, e1]);
});
