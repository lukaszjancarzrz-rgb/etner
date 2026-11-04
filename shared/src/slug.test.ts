import { expect, it } from 'vitest';
import { anchors, slug } from './slug.js';

it('slug: małe litery, bez polskich znaków, inne znaki → jeden „-”', () => {
  expect(slug('Klimatyzacja')).toBe('klimatyzacja');
  expect(slug('Pompy ciepła / C.O.')).toBe('pompy-ciepla-c-o');
  expect(slug('Łazienka Żółć Ąę ŚŃ')).toBe('lazienka-zolc-ae-sn');
  expect(slug('  ')).toBe('');
});

it('anchors: niepuste i unikalne, deterministyczne po kolejności', () => {
  expect(anchors(['Klimatyzacja', 'C.O.', 'C O', '***', '', 'c-o-2', 'Teczka'])).toEqual(['klimatyzacja', 'c-o', 'c-o-2', 'teczka', 'teczka-2', 'c-o-2-2', 'teczka-3']);
  expect(anchors([])).toEqual([]);
});
