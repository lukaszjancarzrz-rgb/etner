import { expect, it } from 'vitest';
import { withoutEchoes } from './write.js';

it('withoutEchoes: tymczasowy znika, gdy przyszedł prawdziwy o tych samych polach', () => {
  const tmp = { id: 'tmp-1', _tmp: true, co: 'Taśma', by: 'u1' };
  const other = { id: 'tmp-2', _tmp: true, co: 'Kolanka', by: 'u1' };
  const real = { id: 'R1', co: 'Taśma', by: 'u1' };
  expect(withoutEchoes([tmp, other], ['co', 'by'])).toEqual([tmp, other]);
  expect(withoutEchoes([tmp, other, real], ['co', 'by'])).toEqual([other, real]);
});
